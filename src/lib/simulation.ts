import { Decision } from "./agent"

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

    return next
    }