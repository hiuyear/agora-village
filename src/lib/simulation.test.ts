import { describe, it, expect } from "vitest"
import { applyIntervention, resolveDecisions, SimState, InterventionEvent, AgentConfig } from "./simulation"
import { Decision } from "./agent"

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

describe("resolveDecisions", () => {
  describe("resource gains", () => {
    it("FARM: farmer gets +5 food, non-farmer gets +3 (both after -1 decay)", () => {
      const state: SimState = {
          turn: 0,
          agents: {
              farmerAgent: { food: 10, ore: 0, gold: 0 },
              otherAgent: { food: 10, ore: 0, gold: 0 }
          }
      }
      const decisions: Record<string, Decision> = {
          farmerAgent: { action: "FARM", reasoning: 'xyz' },
          otherAgent: { action: "FARM", reasoning: 'xyz' }
      }
      const config: AgentConfig[] = [
          { name: "farmerAgent", model: "x", personality: "x", specialty: "farmer" },
          { name: "otherAgent", model: "x", personality: "x", specialty: "miner" }
      ]

      const { next, outcomes } = resolveDecisions(state, decisions, config)

      expect(next.agents.farmerAgent.food).toBe(14) // 10 - 1 + 5
      expect(next.agents.otherAgent.food).toBe(12)  // 10 - 1 + 3
      expect(outcomes.farmerAgent).toBe("ok")
      expect(outcomes.otherAgent).toBe("ok")
    })

    it("MINE: miner gets +3 ore, non-miner gets +2 (food still decays)", () => {
      const state: SimState = {
          turn: 0,
          agents: {
              minerAgent: { food: 10, ore: 5, gold: 0 },
              otherAgent: { food: 10, ore: 5, gold: 0 }
          }
      }
      const decisions: Record<string, Decision> = {
          minerAgent: { action: "MINE", reasoning: 'xyz' },
          otherAgent: { action: "MINE", reasoning: 'xyz' }
      }
      const config: AgentConfig[] = [
          { name: "minerAgent", model: "x", personality: "x", specialty: "miner" },
          { name: "otherAgent", model: "x", personality: "x", specialty: "farmer" }
      ]

      const { next } = resolveDecisions(state, decisions, config)

      expect(next.agents.minerAgent.ore).toBe(8)  // 5 + 3
      expect(next.agents.otherAgent.ore).toBe(7)  // 5 + 2
      expect(next.agents.minerAgent.food).toBe(9) // decay only, no MINE food bonus
    })

    it("REST: gains 1 gold, food still decays", () => {
      const state: SimState = {
          turn: 0,
          agents: { agent1: { food: 10, ore: 0, gold: 3 } }
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "REST", reasoning: 'xyz' }
      }
      const config: AgentConfig[] = [
          { name: "agent1", model: "x", personality: "x", specialty: "farmer" }
      ]

      const { next, outcomes } = resolveDecisions(state, decisions, config)

      expect(next.agents.agent1.gold).toBe(4)
      expect(next.agents.agent1.food).toBe(9)
      expect(outcomes.agent1).toBe("ok")
    })
  })

  describe("food decay", () => {
    it("every agent loses 1 food per turn, floored at 0", () => {
      const state: SimState = {
          turn: 0,
          agents: {
              agent1: { food: 5, ore: 0, gold: 0 },
              agent2: { food: 0, ore: 0, gold: 0 }
          }
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "REST", reasoning: 'xyz' },
          agent2: { action: "REST", reasoning: 'xyz' }
      }
      const config: AgentConfig[] = [
          { name: "agent1", model: "x", personality: "x", specialty: "farmer" },
          { name: "agent2", model: "x", personality: "x", specialty: "farmer" }
      ]

      const { next } = resolveDecisions(state, decisions, config)

      expect(next.agents.agent1.food).toBe(4)
      expect(next.agents.agent2.food).toBe(0) // floor guard, not -1
    })
  })

  describe("outcomes", () => {
    it("leaves an agent with no decision at the default 'no_trade', but still applies food decay", () => {
      const state: SimState = {
          turn: 0,
          agents: {
              agent1: { food: 5, ore: 0, gold: 0 },
              agent2: { food: 5, ore: 0, gold: 0 }
          }
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "REST", reasoning: 'xyz' }
      }
      const config: AgentConfig[] = [
          { name: "agent1", model: "x", personality: "x", specialty: "farmer" },
          { name: "agent2", model: "x", personality: "x", specialty: "farmer" }
      ]

      const { next, outcomes } = resolveDecisions(state, decisions, config)

      expect(outcomes.agent2).toBe("no_trade")
      expect(next.agents.agent2.food).toBe(4) // decay loop covers all agents, not just deciders
    })
  })

  describe("trades", () => {
    it("executes a mirrored trade and marks both agents 'traded'", () => {
      const state: SimState = {
          turn: 0,
          agents: {
              agentA: { food: 10, ore: 0, gold: 10 },
              agentB: { food: 10, ore: 10, gold: 0 }
          }
      }
      const decisions: Record<string, Decision> = {
          agentA: {
              action: "TRADE", reasoning: 'xyz',
              trade: { with: "agentB", offer: { resource: "gold", amount: 5 }, request: { resource: "ore", amount: 3 } }
          },
          agentB: {
              action: "TRADE", reasoning: 'xyz',
              trade: { with: "agentA", offer: { resource: "ore", amount: 3 }, request: { resource: "gold", amount: 5 } }
          }
      }
      const config: AgentConfig[] = [
          { name: "agentA", model: "x", personality: "x", specialty: "farmer" },
          { name: "agentB", model: "x", personality: "x", specialty: "farmer" }
      ]

      const { next, outcomes } = resolveDecisions(state, decisions, config)

      expect(next.agents.agentA.gold).toBe(5)  // 10 - 5
      expect(next.agents.agentA.ore).toBe(3)   // 0 + 3
      expect(next.agents.agentB.ore).toBe(7)   // 10 - 3
      expect(next.agents.agentB.gold).toBe(5)  // 0 + 5
      expect(outcomes.agentA).toBe("traded")
      expect(outcomes.agentB).toBe("traded")
    })

    it("does not execute a one-sided trade proposal (no mirror match)", () => {
      const state: SimState = {
          turn: 0,
          agents: {
              agentA: { food: 10, ore: 0, gold: 10 },
              agentB: { food: 10, ore: 10, gold: 0 }
          }
      }
      const decisions: Record<string, Decision> = {
          agentA: {
              action: "TRADE", reasoning: 'xyz',
              trade: { with: "agentB", offer: { resource: "gold", amount: 5 }, request: { resource: "ore", amount: 3 } }
          },
          agentB: { action: "FARM", reasoning: 'xyz' }
      }
      const config: AgentConfig[] = [
          { name: "agentA", model: "x", personality: "x", specialty: "farmer" },
          { name: "agentB", model: "x", personality: "x", specialty: "farmer" }
      ]

      const { next, outcomes } = resolveDecisions(state, decisions, config)

      expect(next.agents.agentA.gold).toBe(10)
      expect(next.agents.agentA.ore).toBe(0)
      expect(outcomes.agentA).toBe("no_trade")
    })

    it("does not execute a trade the proposer can't afford", () => {
      const state: SimState = {
          turn: 0,
          agents: {
              agentA: { food: 10, ore: 0, gold: 2 }, // can't cover a 5-gold offer
              agentB: { food: 10, ore: 10, gold: 0 }
          }
      }
      const decisions: Record<string, Decision> = {
          agentA: {
              action: "TRADE", reasoning: 'xyz',
              trade: { with: "agentB", offer: { resource: "gold", amount: 5 }, request: { resource: "ore", amount: 3 } }
          },
          agentB: {
              action: "TRADE", reasoning: 'xyz',
              trade: { with: "agentA", offer: { resource: "ore", amount: 3 }, request: { resource: "gold", amount: 5 } }
          }
      }
      const config: AgentConfig[] = [
          { name: "agentA", model: "x", personality: "x", specialty: "farmer" },
          { name: "agentB", model: "x", personality: "x", specialty: "farmer" }
      ]

      const { next, outcomes } = resolveDecisions(state, decisions, config)

      expect(next.agents.agentA.gold).toBe(2)
      expect(next.agents.agentB.ore).toBe(10)
      expect(outcomes.agentA).toBe("no_trade")
      expect(outcomes.agentB).toBe("no_trade")
    })
  })
})
