import { describe, it, expect } from "vitest"
import { computeMetrics } from "./metrics"
import { Decision } from "./agent"

describe("computeMetrics", () => {
  it("reports zero inequality when everyone holds the same gold", () => {

    // arrange, build known inputs
    const state = {
        agents: {
            agent1 : {food: 5, ore: 5, gold: 5},
            agent2:{food: 5, ore: 5, gold: 5},
            agent3: {food: 5, ore: 5, gold: 5}},
        turn: 0
    }
    const decisions: Record<string, Decision> = {
        agent1: { action: "FARM", reasoning: 'xyz'},
        agent2: { action: "FARM", reasoning: 'xyz'},
        agent3: { action: "FARM", reasoning: 'xyz'}
    }
    const outcomes = { agent1: "traded", agent2: "traded", agent3: "traded" } 

    // act, call the function
    const { gini } = computeMetrics(state, decisions, outcomes)

    // assert, dheck the result
    expect(gini).toBeCloseTo(0)
  })

  it("reports zero inequality when there are no agents", () => {
    // hits the `n === 0` guard in gini(),without it this would divide by zero
    const state = { agents: {}, turn: 0 }
    const decisions: Record<string, Decision> = {}
    const outcomes: Record<string, string> = {}

    const { gini } = computeMetrics(state, decisions, outcomes)

    expect(gini).toBeCloseTo(0)
  })

  it("reports zero inequality when everyone holds zero gold", () => {
    // hits the `total === 0` guard, without it this would be the 0/0 NaN trap
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
    // golds = [0, 0, 10] sorted ascending, n = 3
    // weighted = 10
    // G = 0.6667 
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
