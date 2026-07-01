import { Decision } from "./agent"
import { supabase } from '@/lib/supabase'
import { callAgent } from './agent'

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
    ): SimState {

    const next: SimState = {
    turn: state.turn + 1,
    agents: Object.fromEntries(
        Object.entries(state.agents).map(([name, inv]) => [name, { ...inv }])
    ),
    }

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
            // 5 if farmer, else 3
        } else if (decision.action === "MINE") {
            inv.ore += (specialty === "miner" ? 3 : 2)
            // 3 if miner, else 2
        } else if (decision.action === "REST") {
            inv.gold += 1
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
    agents: AgentConfig[]          ← a LIST of per-agent settings
    startingInventory: Inventory
    turns: number
    }
    */

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
            const decision = await callAgent(agent.model, buildPrompt(agent, currentState))
            return { agent, decision }
        })
    )

    const decisions = Object.fromEntries(results.map((r) => [r.agent.name, r.decision]))
    // results shape: [{agent.name, agent.decision}, {...}]
    // mapped shape: [[agent.name, agent.decision], [...]]
    // decisions shape: { agent.name: agent.decision, ..., }
    

    // 4. RESOLVE: resolveDecisions(state, decisions, configs) -> nextState

    const nextState = resolveDecisions(currentState, decisions, config.agents)

    // 5. WRITE:   save nextState (turns table) + each decision (decisions table)

    // 5.1. save to TURNS table
    const { error: turnError } = await supabase.from("turns").insert({
        run_id: runId,
        turn_number: nextState.turn,
        state: nextState,
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
        outcome: null,
    }))

    // insert all decisions at once as an array into supabase
    const { error: decisionsError } = await supabase.from("decisions").insert(decisionRows)
    if (decisionsError) throw new Error(decisionsError.message)
    
    return nextState
}