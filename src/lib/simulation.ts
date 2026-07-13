import { z } from "zod"
import { Decision, Acceptance, callAgent, callAcceptance } from "./agent"
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

export type Offer = {
    from: string      // the proposer's name
    offer: { resource: "food" | "ore" | "gold"; amount: number }    // what the proposer GIVES
    request: { resource: "food" | "ore" | "gold"; amount: number }  // what the proposer WANTS back
}

export type AgreedTrade = {
    proposer: string   // made the offer in round 1
    accepter: string   // said yes in round 2
    offer: { resource: "food" | "ore" | "gold"; amount: number }    // proposer GIVES, accepter receives
    request: { resource: "food" | "ore" | "gold"; amount: number }  // proposer RECEIVES, accepter gives
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

// buildOfferPrompt targetted output:
// Turn 4. You are Rex, a cautious miner.
// Your inventory: 8 food, 2 ore, 6 gold.
// You have received trade offers:
// - Mira (has 2 food, 0 ore, 10 gold) gives you 5 gold and wants 3 ore in return.
// - Juno (has 9 food, 1 ore, 3 gold) gives you 4 food and wants 2 ore in return.
// Your own plan this turn was: MINE.
// Accept one offer by naming the proposer, or keep your own plan.

export function buildOfferPrompt(
    target: AgentConfig,
    offers: Offer[],
    originalDecision: Decision,
    state: SimState
): string {
    const turn = state.turn
    const { name: reviewer, personality, specialty } = target
    const reviewerInventory = state.agents[reviewer]
    
    const offerLines = offers
    .map((o) => {
        const inv = state.agents[o.from]
        return `- ${o.from} (has ${inv.food} food, ${inv.ore} ore, ${inv.gold} gold) gives you ${o.offer.amount} ${o.offer.resource} and wants ${o.request.amount} ${o.request.resource} in return.`
    })
    .join("\n")


    return `Turn ${turn}. You are ${reviewer}, a ${personality} ${specialty}.
    Your inventory: ${reviewerInventory.food} food, ${reviewerInventory.ore} ore, ${reviewerInventory.gold} gold.
    You have received trade offers:
    ${offerLines}
    Your own plan this turn was: ${originalDecision.action}.
    Accept one offer by naming the proposer, or keep your own plan.`
        
}

// Turn round-2 acceptances into the trades that will actually execute, applying the
// locking rules (decision #7). a null or unrecognized `accept` is a decline.
// extracted from advanceTurn into a pure helper for the purpose of unit testing
export function buildAgreedTrades(
    offersByTarget: Record<string, Offer[]>,
    acceptances: { target: string; acceptance: Acceptance }[]
): AgreedTrade[] {
    const agreedTrades: AgreedTrade[] = []
    const locked = new Set<string>()
    // alphabetical by target → deterministic which trade wins when agents conflict
    const ordered = [...acceptances].sort((a, b) => a.target.localeCompare(b.target))
    for (const { target, acceptance } of ordered) {
        const chosen = acceptance.accept
        if (chosen === null) continue                            // declined all
        const match = offersByTarget[target]?.find((o) => o.from === chosen)
        if (!match) continue                                     // accepted a name that never offered → decline
        if (locked.has(target) || locked.has(chosen)) continue   // one trade per agent per turn
        agreedTrades.push({ proposer: chosen, accepter: target, offer: match.offer, request: match.request })
        locked.add(target)
        locked.add(chosen)
    }
    return agreedTrades
}

export function resolveDecisions(
    state: SimState,
    decisions: Record<string, Decision>,
    config: AgentConfig[],
    agreedTrades: AgreedTrade[]
    ): { next: SimState; outcomes: Record<string, string> } { // outcomes -> {agentA, action}

    // action loop skips all agents who's in an agreed trade
    const locked = new Set(agreedTrades.flatMap((t) => [t.proposer, t.accepter]))

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

        //locked agent does no FARM/REST/MINE
        if (locked.has(name)) continue

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

    // execute the round-2 agreed trades. consent already came from the acceptance
    // round, so there's no matching to do (that's why the old mirror search is gone);
    // we just check affordability and swap
    for (const t of agreedTrades) {
        const proposerInv = next.agents[t.proposer]
        const accepterInv = next.agents[t.accepter]

        // affordability: skip if either side can't cover what it owes
        if (proposerInv[t.offer.resource] < t.offer.amount) continue
        if (accepterInv[t.request.resource] < t.request.amount) continue

        // swap: proposer gives `offer` and receives `request`; accepter is the mirror
        proposerInv[t.offer.resource] -= t.offer.amount
        proposerInv[t.request.resource] += t.request.amount
        accepterInv[t.request.resource] -= t.request.amount
        accepterInv[t.offer.resource] += t.offer.amount

        outcomes[t.proposer] = "traded"
        outcomes[t.accepter] = "traded"
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
    
    // ROUND 2: negotiation (decision #7) 
    const configByName = Object.fromEntries(config.agents.map((c) => [c.name, c]))

    // (1+2) collect TRADE proposals, grouped by target agent.
    const offersByTarget: Record<string, Offer[]> = {}
    for (const [proposer, decision] of Object.entries(decisions)) {
        if (decision.action !== "TRADE" || !decision.trade) continue
        const target = decision.trade.with
        // target must be a real, different agent (guard hallucinated / self targets)
        if (!(target in decisions) || target === proposer) continue
        // leftover now: trade requests with valid targets
        offersByTarget[target] ??= []
        offersByTarget[target].push({
            from: proposer,
            offer: decision.trade.offer,
            request: decision.trade.request,
        })
    }

    // (3) round 2: one acceptance call per TARGETED agent, in parallel
    const acceptanceResults = await Promise.all(
        Object.entries(offersByTarget).map(async ([target, offers]) => {
            const acceptance = await callAcceptance(
                configByName[target].model,
                buildOfferPrompt(configByName[target], offers, decisions[target], workingState)
            )
            return { target, acceptance }
        })
    )

    // (4) turn acceptances into agreedTrades, with locking (extracted + unit-tested)
    const agreedTrades = buildAgreedTrades(offersByTarget, acceptanceResults)

    // (5) fallback: any proposer whose offer was NOT accepted rests this turn.
    // Skip anyone actually IN a trade — proposer OR accepter. An agent can be a
    // declined proposer AND the accepter of someone else's offer; downgrading it to
    // REST would mislabel a trading agent as resting in actionDist (state is fine
    // either way, since resolveDecisions locks trade participants out of solo actions).
    const inTrade = new Set(agreedTrades.flatMap((t) => [t.proposer, t.accepter]))
    const allProposers = Object.values(offersByTarget)
        .flat()
        .map((o) => o.from)
    for (const proposer of allProposers) {
        if (inTrade.has(proposer)) continue
        decisions[proposer] = { action: "REST", reasoning: "trade offer declined" }
    }

    // 4. RESOLVE: resolveDecisions(state, decisions, configs, agreedTrades) -> nextState

    const { next: nextState, outcomes } = resolveDecisions(workingState, decisions, config.agents, agreedTrades)

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