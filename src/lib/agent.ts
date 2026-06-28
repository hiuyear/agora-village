import Anthropic from "@anthropic-ai/sdk"

const systemPrompt = `You are an agent in an economic village simulation.
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

export async function callAgent(model: string, prompt: string){
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY})
    const msg = await client.messages.create({
        model: model,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{role: 'user', content: prompt}],
    })

    const response = msg.content[0]
    if (response.type === 'text'){
        return JSON.parse(response.text)
    }
}