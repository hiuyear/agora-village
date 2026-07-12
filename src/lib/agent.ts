import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import {z} from 'zod'

const actionSystemPrompt = `You are an agent in an economic village simulation.
Each turn you choose one action. Available actions:
- FARM: gain food (farmers get a bonus)
- MINE: gain ore (miners get a bonus)
- REST: gain gold
- TRADE: exchange resources with another agent

Respond ONLY with valid JSON — no markdown, no explanation outside the JSON:
{
  "action": "FARM" | "MINE" | "TRADE" | "REST",
  "trade": { "with": "<agent name>", "offer": { "resource": "food"|"ore"|"gold", "amount": <integer> }, "request": { "resource": "food"|"ore"|"gold", "amount": <integer> } },
  "reasoning": "<one sentence>"
}
Only include "trade" if action is TRADE.`

const acceptanceSystemPrompt = `You are an agent in an economic village simulation.
Other agents have offered to trade with you. Accept one offer, or keep your own plan.

Respond ONLY with valid JSON — no markdown, no explanation outside the JSON:
{
  "accept": "<proposer name>" | null,
  "reasoning": "<one sentence>"
}
Set "accept" to the name of the proposer whose offer you accept, or null to decline all offers and keep your plan.`


export const DecisionSchema = z.object({
    action: z.enum(["FARM", "MINE", "TRADE", "REST"]),
    trade: z.object({
        with: z.string(),
        offer: z.object({
            resource: z.enum(["food", "ore", "gold"]),
            amount: z.number().int()
        }),
        request: z.object({
            resource: z.enum(["food", "ore", "gold"]),
            amount: z.number().int()
        })
    }).optional(),
    reasoning: z.string()
  })

export type Decision = z.infer<typeof DecisionSchema>

export const AcceptanceSchema = z.object({
    accept: z.string().nullable(), // agent name if accept (null = reject)
    reasoning: z.string() // reason for accepting/rejecting trade offer
})

export type Acceptance = z.infer<typeof AcceptanceSchema>

// Models sometimes wrap JSON in a markdown code fence (```json ... ```)
// despite being told not to. Strip it before parsing.
export function stripCodeFence(raw: string): string {
    const text = raw.trim()
    if (!text.startsWith("```")) return text
    return text
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, "")
        .trim()
}

async function callLLM(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    // the exact Anthropic/OpenAI branch you already have, but:
    //   - `system:` / the system message use the systemPrompt PARAMETER (not a module const)
    //   - the user content uses userPrompt
    //   - end with:  return stripCodeFence(text)

    let text: string

    if (model.startsWith("claude-")) {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const msg = await client.messages.create({
            model: model,
            max_tokens: 300,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
        })

        const response = msg.content[0]
        if (response.type !== "text") {
            throw new Error(`Unexpected response type: ${response.type}`)
        }
        text = response.text

    } else if (model.startsWith("gpt-")) {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const completion = await client.chat.completions.create({
            model: model,
            max_tokens: 300,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
        })

        const content = completion.choices[0].message.content
        if (content === null) {
            throw new Error("OpenAI returned empty content")
        }
        text = content
    } else {
        throw new Error(`Unknown model provider: ${model}`)
    }

    return stripCodeFence(text)
}   

export async function callAgent(model: string, prompt: string): Promise<Decision> {
    const text = await callLLM(model, actionSystemPrompt, prompt)
    return DecisionSchema.parse(JSON.parse(text))
}

export async function callAcceptance(model: string, prompt: string): Promise<Acceptance> {
    const text = await callLLM(model, acceptanceSystemPrompt, prompt)
    return AcceptanceSchema.parse(JSON.parse(text))
}
