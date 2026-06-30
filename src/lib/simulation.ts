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
