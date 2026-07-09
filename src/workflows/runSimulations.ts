import { advanceTurn } from "@/lib/simulation";
import { supabase } from "@/lib/supabase";

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

// status write = DB access = must be a step (workflow sandbox can't reach Supabase)
async function setRunStatusStep(runId: string, status: "completed" | "error") {
    "use step";
    await supabase.from("runs").update({ status }).eq("id", runId);
  }

  export async function runSimulationWorkflow(runId: string, turns: number) {
    "use workflow";
    try {
      for (let i = 0; i < turns; i++) {
        await advanceTurnStep(runId);
      }
      await setRunStatusStep(runId, "completed");   // ALL turns ran to the end -> done
    } catch (e) {
      await setRunStatusStep(runId, "error"); // a step exhausted retries -> failed
      throw e; // rethrow so WDK also marks the run failed
    }
  }
