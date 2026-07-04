import { SimState } from "./simulation"
import { Decision } from "./agent"

export type Metrics = {
    gini: number
    tradeRate: number
    actionDist: Record<string, number>
}

// Gini coefficient of a list of non-negative values, in [0, 1].
//   0 = perfect equality (everyone holds the same)
//   1 = perfect inequality (one holder has everything)
// Closed form over the ASCENDING-sorted values with 1-based rank i:
//   G = (2 * Σ i·x_i) / (n · Σ x_i)  −  (n + 1) / n
function gini(values: number[]): number {
    const n = values.length
    if (n === 0) return 0 // avoid divison by zero error

    // copy before sorting — .sort() mutates in place
    const sorted = [...values].sort((a, b) => a - b)

    const total = sorted.reduce((sum, x) => sum + x, 0)
    if (total === 0) return 0 // everyone equal at zero -> perfect equality, not 0/0

    // Σ i·x_i, where array index `idx` (0-based) maps to rank i = idx + 1
    const weighted = sorted.reduce((sum, x, idx) => sum + (idx + 1) * x, 0)

    return (2 * weighted) / (n * total) - (n + 1) / n
}

export function computeMetrics(
    state: SimState,
    decisions: Record<string, Decision>,
    outcomes: Record<string, string>
): Metrics {
    // GINI — inequality of wealth, measured over gold (decision #15)
    const golds = Object.values(state.agents).map((inv) => inv.gold)
    const giniValue = gini(golds)

    // ACTION DISTRIBUTION — tally how many agents chose each action this turn
    const actionDist: Record<string, number> = {}
    for (const decision of Object.values(decisions)) {
        actionDist[decision.action] = (actionDist[decision.action] ?? 0) + 1
    }

    // TRADE RATE — participation rate: fraction of agents that executed a trade.
    // A mirror trade marks BOTH partners "traded", so counting "traded" outcomes
    // counts PARTICIPANTS, which is exactly this metric — no division by 2.
    const nAgents = Object.keys(state.agents).length
    const traded = Object.values(outcomes).filter((o) => o === "traded").length
    const tradeRate = nAgents === 0 ? 0 : traded / nAgents

    return { gini: giniValue, tradeRate, actionDist }
}
