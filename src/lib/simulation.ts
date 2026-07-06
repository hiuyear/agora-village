import { z } from "zod"
import { Decision, callAgent } from "./agent"
import { computeMetrics } from "./metrics"
import { supabase } from '@/lib/supabase'

export type AgentConfig = {
    name: string,
    model: string,
    personality: string,
    specialty: string
}

export type SimState = {
    turn: number,
    agents: Record<string, Inventory>
}

export type Inventory = { food: number; ore: number; gold: number}

export type RunConfig = {
    agents: AgentConfig[]
    startingInventory: Inventory
    turns: number
}

// Observer-injected shock. Validated at the API boundary (POST /intervene),
// applied in advanceTurn BEFORE agents decide (deferred-effect, decision #17).
export const InterventionSchema = z.object({
    event_type: z.enum(["drought", "boom", "plague"]),
    parameters: z.record(z.string(), z.any()).optional(),
})

export type InterventionEvent = z.infer<typeof InterventionSchema>


export function buildPrompt(agent: AgentConfig, state: SimState): string {
    const turn = state.turn
    const name = agent.name
    const personality = agent.personality
    const specialty = agent.specialty
    const agents = state.agents

    // retrieve info about self
    const me = agents[name]

    // retrieve info about other agents excluding self
    const others = Object.entries(agents)
        .filter(([n]) => n !== name)
        .map(([n, inv]) => ` ${n}: ${inv.food} food, ${inv.ore} ore, ${inv.gold} gold`)
        .join("\n")

    return `Turn ${turn}. You are ${name}, a ${personality} ${specialty}.
    Your inventory: ${me.food} food, ${me.ore} ore, ${me.gold} gold.
    Other agents:
    ${others}
    Decide your action.`
}

export function resolveDecisions(
    state: SimState,
    decisions: Record<string, Decision>,
    config: AgentConfig[]
    ): { next: SimState; outcomes: Record<string, string> } { // outcomes -> {agentA, action}

    const next: SimState = {
    turn: state.turn + 1,
    agents: Object.fromEntries(
        Object.entries(state.agents).map(([name, inv]) => [name, { ...inv }])
    ),
    }

    // seed EVERY agent pessimistically up front (default-then-upgrade). coverage
    // is guaranteed in one unconditional statement; every branch below only
    // OVERWRITES. FARM/MINE/REST -> "ok"; a trade that executes -> "traded";
    // anything left untouched keeps "no_trade".
    const outcomes: Record<string, string> = Object.fromEntries(
        Object.keys(next.agents).map((name) => [name, "no_trade"])
    )

    // every turn, each agent loses 1 food
    for (const name of Object.keys(next.agents)) {
        next.agents[name].food = Math.max(0, next.agents[name].food - 1)
    }
    
    // act on the decisions 
    const configByName = Object.fromEntries(config.map((c) => [c.name, c]))

    for (const [name, decision] of Object.entries(decisions)){
        const inv = next.agents[name]
        const specialty = configByName[name].specialty 

        if (decision.action === "FARM") {
            inv.food += (specialty === "farmer" ? 5 : 3)
            outcomes[name] = "ok"
            // 5 if farmer, else 3
        } else if (decision.action === "MINE") {
            inv.ore += (specialty === "miner" ? 3 : 2)
            outcomes[name] = "ok"
            // 3 if miner, else 2
        } else if (decision.action === "REST") {
            inv.gold += 1
            outcomes[name] = "ok"
            // gold is the trade medium.
        }
    }

    // resolve trades — MVP: both agents must independently propose the mirror trade.
    // (Known weak: relies on coincidence. Redesign lives on branch `negotiating-trade-offers`.)
    const trades = Object.entries(decisions).filter(
        ([, d]) => d.action === "TRADE" && d.trade
    )

    for (const [nameA, decA] of trades) {
        const tA = decA.trade!

        // find a partner whose trade is the exact mirror of A's
        const partner = trades.find(([nameB, decB]) => {
            const tB = decB.trade!
            return (
                nameB === tA.with &&
                tB.with === nameA &&
                tB.offer.resource === tA.request.resource &&
                tB.offer.amount === tA.request.amount &&
                tB.request.resource === tA.offer.resource &&
                tB.request.amount === tA.offer.amount
            )
        })
        if (!partner) continue

        const [nameB] = partner
        if (nameA > nameB) continue // execute each matched pair only once

        const invA = next.agents[nameA]
        const invB = next.agents[nameB]

        // affordability — skip if either side can't cover what it offered
        if (invA[tA.offer.resource] < tA.offer.amount) continue
        if (invB[tA.request.resource] < tA.request.amount) continue

        // execute the swap: A gives offer, gets request; B is the mirror
        invA[tA.offer.resource] -= tA.offer.amount
        invA[tA.request.resource] += tA.request.amount
        invB[tA.request.resource] -= tA.request.amount
        invB[tA.offer.resource] += tA.offer.amount

        // both sides of the swap just traded — upgrade BOTH from "no_trade"
        outcomes[nameA] = "traded"
        outcomes[nameB] = "traded"

    }

    return { next, outcomes }
    }

//      "drought" → food = Math.floor(food * 0.5)     (scarcity)
//      "boom"    → food += 5; ore += 5               (abundance)
//      "plague"  → food, ore, gold each = Math.floor(x * 0.7)
export function applyIntervention(state: SimState, event: InterventionEvent): SimState {
    // make a copy to wokr with
    const next: SimState = {
        turn: state.turn,
        agents: Object.fromEntries(
            Object.entries(state.agents).map(([name, inv]) => [name, {...inv}])
        )
    }
    // keep next.turn, since turn is already +1 in advanceTurn AFTER calling applyIntervention
    if (event.event_type === 'drought'){
        for (const name of Object.keys(next.agents)){
            const inv = next.agents[name]
            inv.food = Math.floor(inv.food * 0.5)
        }
        } else if (event.event_type === 'boom'){
            for (const name of Object.keys(next.agents)){
                const inv = next.agents[name]
                inv.food += 5
                inv.ore += 5
            }
            // apply boom on next
        } else if (event.event_type === 'plague'){
            // apply plague
            for (const name of Object.keys(next.agents)){
                const inv = next.agents[name]
                inv.food = Math.floor(inv.food * 0.7)
                inv.ore  = Math.floor(inv.ore  * 0.7)
                inv.gold = Math.floor(inv.gold * 0.7)
            }
        }
    return next
}

export async function advanceTurn(runId: string): Promise<SimState> {

    // 1. READ:    load run config + latest turn's state from Supabase
    const {data: run, error} = await supabase
        .from('runs')
        .select("config, status")
        .eq("id", runId)
        .single()

    if (error || !run) throw new Error(error?.message ?? "Run not found")

    const config = run.config as RunConfig
    /* shape: 
    {
    agents: AgentConfig[]          <- a LIST of per-agent settings
    startingInventory: Inventory
    turns: number
    }
    */

    // from all turns of runId, take the latest turn data
    const { data: lastTurn } = await supabase
    .from("turns")
    .select("state, turn_number")
    .eq("run_id", runId)
    .order("turn_number", { ascending: false })
    .limit(1)
    .maybeSingle()
    
    // if no prior turn exists: build initial state from config.startinfgInventory
    const currentState: SimState = lastTurn
    ? (lastTurn.state as SimState)
    : {
        turn: 0,
        agents: Object.fromEntries(
            config.agents.map((a) => [a.name, { ...config.startingInventory }])
        ),
    }

    // 1.5 INTERVENE: apply any shocks scheduled for the turn we're about to produce,
    // BEFORE agents decide — so they experience the shock this turn (decision #17).
    // can apply multiple intervention events per turn.
    // TODO (reproducibility): these apply in Supabase's arbitrary return order.
    // Multiple shocks on one turn aren't perfectly commutative (Math.floor), so
    // add .order('created_at', { ascending: true }) for deterministic replay.
    const targetTurn = currentState.turn + 1
    const { data: pendingInterventions } = await supabase
        .from("interventions")
        .select("event_type, parameters")
        .eq("run_id", runId)
        .eq("turn_number", targetTurn)

    let workingState = currentState
    for (const ev of pendingInterventions ?? []) {  // apply each state individually
        workingState = applyIntervention(workingState, ev as InterventionEvent)
    }


    // 2. PROMPT:  buildPrompt(agent, state) for each agent
    // 3. ASK:     callAgent(model, prompt) for all agents IN PARALLEL

    /* THIS IS SLOW!!! DISABLED
    const decisions: Record<string, Decision> = {}
    for (const agent of config.agents) {
        decisions[agent.name] = await callAgent(agent.model, buildPrompt(agent, currentState))
    }
    */

    const results = await Promise.all(
        config.agents.map(async (agent) => {
            const decision = await callAgent(agent.model, buildPrompt(agent, workingState))
            return { agent, decision }
        })
    )

    const decisions = Object.fromEntries(results.map((r) => [r.agent.name, r.decision]))
    // results shape: [{agent.name, agent.decision}, {...}]
    // mapped shape: [[agent.name, agent.decision], [...]]
    // decisions shape: { agent.name: agent.decision, ..., }
    

    // 4. RESOLVE: resolveDecisions(state, decisions, configs) -> nextState

    const { next: nextState, outcomes } = resolveDecisions(workingState, decisions, config.agents)

    // 5. WRITE:   save nextState (turns table) + each decision (decisions table)

    // metrics describe THIS turn: gini over the resulting gold distribution,
    // plus the actions/trades that produced it (this turn's decisions + outcomes).
    const metrics = computeMetrics(nextState, decisions, outcomes)

    // 5.1. save to TURNS table
    const { error: turnError } = await supabase.from("turns").insert({
        run_id: runId,
        turn_number: nextState.turn,
        state: nextState,
        metrics: metrics,
    })

    if (turnError) throw new Error(turnError.message)

    // 5.2. save to DECISIONS table
    const decisionRows = results.map((r) => ({
        run_id: runId,
        turn_number: nextState.turn,
        agent_id: r.agent.name,
        agent_model: r.agent.model,
        action: r.decision.action,
        target: r.decision.trade?.with ?? null,
        offer: r.decision.trade?.offer ?? null,
        request: r.decision.trade?.request ?? null,
        reasoning: r.decision.reasoning,
        raw_response: null,
        outcome: outcomes[r.agent.name],
    }))

    // insert all decisions at once as an array into supabase
    const { error: decisionsError } = await supabase.from("decisions").insert(decisionRows)
    if (decisionsError) throw new Error(decisionsError.message)
    
    return nextState
}