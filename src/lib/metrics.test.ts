import { describe, it, expect } from "vitest"
import { computeMetrics } from "./metrics"
import { Decision } from "./agent"

describe("computeMetrics", () => {
  describe("gini", () => {
    it("reports zero inequality when everyone holds the same gold", () => {
      const state = {
          agents: {
              agent1: {food: 5, ore: 5, gold: 5},
              agent2: {food: 5, ore: 5, gold: 5},
              agent3: {food: 5, ore: 5, gold: 5}},
          turn: 0
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "FARM", reasoning: 'xyz'},
          agent2: { action: "FARM", reasoning: 'xyz'},
          agent3: { action: "FARM", reasoning: 'xyz'}
      }
      const outcomes = { agent1: "traded", agent2: "traded", agent3: "traded" }

      const { gini } = computeMetrics(state, decisions, outcomes)

      expect(gini).toBeCloseTo(0)
    })

    it("reports zero inequality when there are no agents", () => {
      // n === 0 guard — would otherwise divide by zero
      const state = { agents: {}, turn: 0 }
      const decisions: Record<string, Decision> = {}
      const outcomes: Record<string, string> = {}

      const { gini } = computeMetrics(state, decisions, outcomes)

      expect(gini).toBeCloseTo(0)
    })

    it("reports zero inequality when everyone holds zero gold", () => {
      // total === 0 guard — otherwise the 0/0 NaN trap
      const state = {
          agents: {
              agent1: {food: 0, ore: 0, gold: 0},
              agent2: {food: 0, ore: 0, gold: 0},
              agent3: {food: 0, ore: 0, gold: 0}},
          turn: 0
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "REST", reasoning: 'xyz'},
          agent2: { action: "REST", reasoning: 'xyz'},
          agent3: { action: "REST", reasoning: 'xyz'}
      }
      const outcomes = { agent1: "ok", agent2: "ok", agent3: "ok" }

      const { gini } = computeMetrics(state, decisions, outcomes)

      expect(gini).toBeCloseTo(0)
    })

    it("reports high inequality when one agent holds all the gold", () => {
      // golds = [0, 0, 10], n = 3: G = (2*30)/(3*10) - 4/3 = 0.6667
      const state = {
          agents: {
              agent1: {food: 0, ore: 0, gold: 0},
              agent2: {food: 0, ore: 0, gold: 0},
              agent3: {food: 0, ore: 0, gold: 10}},
          turn: 0
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "REST", reasoning: 'xyz'},
          agent2: { action: "REST", reasoning: 'xyz'},
          agent3: { action: "REST", reasoning: 'xyz'}
      }
      const outcomes = { agent1: "ok", agent2: "ok", agent3: "ok" }

      const { gini } = computeMetrics(state, decisions, outcomes)

      expect(gini).toBeCloseTo(0.6667, 4)
    })
  })

  describe("tradeRate", () => {
    it("computes the fraction of agents that traded", () => {
      const state = {
          agents: {
              agent1: {food: 0, ore: 0, gold: 0},
              agent2: {food: 0, ore: 0, gold: 0},
              agent3: {food: 0, ore: 0, gold: 0},
              agent4: {food: 0, ore: 0, gold: 0}},
          turn: 0
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "TRADE", reasoning: 'xyz'},
          agent2: { action: "TRADE", reasoning: 'xyz'},
          agent3: { action: "FARM", reasoning: 'xyz'},
          agent4: { action: "MINE", reasoning: 'xyz'}
      }
      const outcomes = {
          agent1: "traded",
          agent2: "traded",
          agent3: "rested",
          agent4: "rested"
      }

      const { tradeRate } = computeMetrics(state, decisions, outcomes)

      expect(tradeRate).toBeCloseTo(0.5)
    })

    it("returns zero when no agents traded", () => {
      const state = {
          agents: {
              agent1: {food: 0, ore: 0, gold: 0},
              agent2: {food: 0, ore: 0, gold: 0}},
          turn: 0
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "FARM", reasoning: 'xyz'},
          agent2: { action: "MINE", reasoning: 'xyz'}
      }
      const outcomes = { agent1: "rested", agent2: "rested" }

      const { tradeRate } = computeMetrics(state, decisions, outcomes)

      expect(tradeRate).toBeCloseTo(0)
    })

    it("returns one when every agent traded", () => {
      const state = {
          agents: {
              agent1: {food: 0, ore: 0, gold: 0},
              agent2: {food: 0, ore: 0, gold: 0}},
          turn: 0
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "TRADE", reasoning: 'xyz'},
          agent2: { action: "TRADE", reasoning: 'xyz'}
      }
      const outcomes = { agent1: "traded", agent2: "traded" }

      const { tradeRate } = computeMetrics(state, decisions, outcomes)

      expect(tradeRate).toBeCloseTo(1)
    })

    it("returns zero when there are no agents", () => {
      // nAgents === 0 guard — would otherwise divide by zero
      const state = { agents: {}, turn: 0 }
      const decisions: Record<string, Decision> = {}
      const outcomes: Record<string, string> = {}

      const { tradeRate } = computeMetrics(state, decisions, outcomes)

      expect(tradeRate).toBeCloseTo(0)
    })
  })

  describe("actionDist", () => {
    it("tallies how many agents chose each action", () => {
      const state = {
          agents: {
              agent1: {food: 0, ore: 0, gold: 0},
              agent2: {food: 0, ore: 0, gold: 0},
              agent3: {food: 0, ore: 0, gold: 0},
              agent4: {food: 0, ore: 0, gold: 0}},
          turn: 0
      }
      const decisions: Record<string, Decision> = {
          agent1: { action: "FARM", reasoning: 'xyz'},
          agent2: { action: "FARM", reasoning: 'xyz'},
          agent3: { action: "MINE", reasoning: 'xyz'},
          agent4: { action: "REST", reasoning: 'xyz'}
      }
      const outcomes = {
          agent1: "farmed", agent2: "farmed", agent3: "mined", agent4: "rested"
      }

      const { actionDist } = computeMetrics(state, decisions, outcomes)

      expect(actionDist).toEqual({ FARM: 2, MINE: 1, REST: 1 })
    })

    it("returns an empty distribution when there are no agents", () => {
      const state = { agents: {}, turn: 0 }
      const decisions: Record<string, Decision> = {}
      const outcomes: Record<string, string> = {}

      const { actionDist } = computeMetrics(state, decisions, outcomes)

      expect(actionDist).toEqual({})
    })
  })
})
