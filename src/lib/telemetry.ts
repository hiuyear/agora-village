import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { appendFileSync, mkdirSync } from "node:fs"

// Braintrust ingests traces over the OTLP/HTTP protocol — same shape any OTel
// backend expects, just a different URL + auth headers. That's the whole
// "vendor is a view, not a dependency" idea: swapping backends later is a
// config change here, not a rewrite of the instrumented code.
const braintrustExporter = new OTLPTraceExporter({
    url: "https://api.braintrust.dev/otel/v1/traces",
    headers: {
        Authorization: `Bearer ${process.env.BRAINTRUST_API_KEY}`,
        "x-bt-parent": `project_name:${process.env.BRAINTRUST_PROJECT_NAME}`,
    },
})

// BatchSpanProcessor queues spans and ships them in batches instead of one
// HTTP request per span — the standard exporter pipeline: tracer -> processor -> exporter.
const provider = new BasicTracerProvider({
    spanProcessors: [new BatchSpanProcessor(braintrustExporter)],
})

const tracer = provider.getTracer("agora-village")

mkdirSync("traces", { recursive: true })

type LLMSpanInfo = {
    runId: string
    turn: number
    agent: string
    model: string
    inputTokens: number
    outputTokens: number
    latencyMs: number
}

// The LLM call already happened by the time we get here (usage/latency come
// back from callAgent/callAcceptance after the fact). So instead of wrapping
// the call live, we backdate the span to when it actually started using the
// measured latency — the span's duration still matches reality.
export function recordLLMSpan(info: LLMSpanInfo) {
    const end = Date.now()
    const start = end - info.latencyMs

    const span = tracer.startSpan("gen_ai.call", {
        startTime: start,
        attributes: {
            // gen_ai.* — the OTel semantic convention for LLM calls, so any
            // OTel-aware backend (not just Braintrust) understands these fields.
            "gen_ai.request.model": info.model,
            "gen_ai.usage.input_tokens": info.inputTokens,
            "gen_ai.usage.output_tokens": info.outputTokens,
            // custom attrs, ours to name — tie the span back to the village's own data
            run_id: info.runId,
            turn: info.turn,
            agent: info.agent,
        },
    })
    span.end(end)

    // local JSONL mirror — if Braintrust is down or the key is wrong, we still
    // have the trace on disk. one line per LLM call.
    appendFileSync(
        "traces/spans.jsonl",
        JSON.stringify({ ts: new Date(start).toISOString(), ...info }) + "\n"
    )
}
