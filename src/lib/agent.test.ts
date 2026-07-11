import { describe, it, expect } from "vitest"
import { stripCodeFence, DecisionSchema } from "./agent"

describe("stripCodeFence", () => {
  it("returns unfenced text as-is, trimmed", () => {
    expect(stripCodeFence('  {"action":"REST"}  ')).toBe('{"action":"REST"}')
  })

  it("strips a ```json fence", () => {
    const raw = '```json\n{"action":"REST"}\n```'
    expect(stripCodeFence(raw)).toBe('{"action":"REST"}')
  })

  it("strips a plain ``` fence with no language tag", () => {
    const raw = '```\n{"action":"REST"}\n```'
    expect(stripCodeFence(raw)).toBe('{"action":"REST"}')
  })
})

describe("DecisionSchema", () => {
  it("accepts a valid FARM decision with no trade field", () => {
    const result = DecisionSchema.safeParse({ action: "FARM", reasoning: "food is low" })
    expect(result.success).toBe(true)
  })

  it("accepts a valid TRADE decision with a trade object", () => {
    const result = DecisionSchema.safeParse({
        action: "TRADE",
        reasoning: "I need ore",
        trade: {
            with: "agentB",
            offer: { resource: "gold", amount: 5 },
            request: { resource: "ore", amount: 3 }
        }
    })
    expect(result.success).toBe(true)
  })

  it("rejects an action outside the FARM/MINE/TRADE/REST enum", () => {
    const result = DecisionSchema.safeParse({ action: "ATTACK", reasoning: "why not" })
    expect(result.success).toBe(false)
  })

  it("rejects a decision missing reasoning", () => {
    const result = DecisionSchema.safeParse({ action: "REST" })
    expect(result.success).toBe(false)
  })

  it("rejects a non-integer trade amount", () => {
    const result = DecisionSchema.safeParse({
        action: "TRADE",
        reasoning: "partial gold?",
        trade: {
            with: "agentB",
            offer: { resource: "gold", amount: 2.5 },
            request: { resource: "ore", amount: 3 }
        }
    })
    expect(result.success).toBe(false)
  })
})
