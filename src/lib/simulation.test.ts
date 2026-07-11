import { describe, it, expect } from "vitest"
import { applyIntervention, SimState, InterventionEvent } from "./simulation"

describe("applyIntervention", () => {
  it("drought halves food (rounded down), leaves ore and gold untouched", () => {
    const state: SimState = {
        turn: 3,
        agents: { agent1: { food: 7, ore: 4, gold: 2 } }
    }
    const event: InterventionEvent = { event_type: "drought" }

    const next = applyIntervention(state, event)

    expect(next.agents.agent1.food).toBe(3) // floor(7*0.5)
    expect(next.agents.agent1.ore).toBe(4)
    expect(next.agents.agent1.gold).toBe(2)
  })

  it("boom adds 5 food and 5 ore, leaves gold untouched", () => {
    const state: SimState = {
        turn: 3,
        agents: { agent1: { food: 7, ore: 4, gold: 2 } }
    }
    const event: InterventionEvent = { event_type: "boom" }

    const next = applyIntervention(state, event)

    expect(next.agents.agent1.food).toBe(12)
    expect(next.agents.agent1.ore).toBe(9)
    expect(next.agents.agent1.gold).toBe(2)
  })

  it("plague scales all three resources by 0.7, rounded down", () => {
    const state: SimState = {
        turn: 3,
        agents: { agent1: { food: 10, ore: 3, gold: 1 } }
    }
    const event: InterventionEvent = { event_type: "plague" }

    const next = applyIntervention(state, event)

    expect(next.agents.agent1.food).toBe(7) // floor(10*0.7)
    expect(next.agents.agent1.ore).toBe(2)  // floor(3*0.7) = floor(2.1)
    expect(next.agents.agent1.gold).toBe(0) // floor(1*0.7) = floor(0.7)
  })

  it("preserves the turn number — advanceTurn increments it separately", () => {
    const state: SimState = {
        turn: 5,
        agents: { agent1: { food: 1, ore: 1, gold: 1 } }
    }
    const event: InterventionEvent = { event_type: "boom" }

    const next = applyIntervention(state, event)

    expect(next.turn).toBe(5)
  })

  it("doesn't mutate the input state", () => {
    const state: SimState = {
        turn: 1,
        agents: { agent1: { food: 10, ore: 10, gold: 10 } }
    }
    const event: InterventionEvent = { event_type: "drought" }

    applyIntervention(state, event)

    expect(state.agents.agent1.food).toBe(10)
  })
})
