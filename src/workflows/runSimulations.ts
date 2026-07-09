import { advanceTurn } from "@/lib/simulation";

// IMPORTANT: vercel time ouit at ~ 300s
// advanceTurn (pure turn logic, in lib/) stays WDK-agnostic so /advance and
// unit tests can call it directly. advanceTurnStep is a thin durable boundary
// around it. a prod run enters thru runSimulationWorkflow, which calls
// the step, which calls advanceTurn, so the logic still runs, just via the
// durable step rather than a direct call

async function advanceTurnStep(runId: string) {
  "use step";
  const state = await advanceTurn(runId)
  return state
}

export async function runSimulationWorkflow(runId: string, turns: number) {
    "use workflow";
    for (let i = 0; i < turns; i++) {
        await advanceTurnStep(runId)
  }
}