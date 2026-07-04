import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/runs/[id]/metrics
// Feeds the research dashboard. No auth: reads are public (only mutating routes
// use requireCreator). Run-level numbers are aggregated ON READ (decision #18) —
// no run_metrics table.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const { id } = params

    // 1. TIMELINE — per-turn metrics we already stored in turns.metrics (Stage 3).
    //    Each row's `metrics` jsonb IS { gini, tradeRate, actionDist }.
    const { data: turnRows, error: turnsError } = await supabase
        .from('turns')
        .select('turn_number, metrics')
        .eq('run_id', id)
        .order('turn_number', { ascending: true })

    if (turnsError) {
        return NextResponse.json({ error: turnsError.message }, { status: 500 })
    }

    const timeline = (turnRows ?? []).map((row) => ({
        turn_number: row.turn_number,
        ...(row.metrics as Record<string, unknown>),
    }))

    // shape:
    // {
    //     "timeline": [
    //       {
    //         "turn_number": 1,
    //         "gini": 0,
    //         "tradeRate": 0,
    //         "actionDist": { "FARM": 2, "MINE": 2, "REST": 1 }
    //       },
    //       {
    //         "turn_number": 2,
    //         "gini": 0.16,
    //         "tradeRate": 0,
    //         "actionDist": { "FARM": 1, "MINE": 1, "REST": 3 }
    //       },
    //       {
    //         "turn_number": 3,
    //         "gini": 0.24,
    //         "tradeRate": 0.4,
    //         "actionDist": { "FARM": 1, "REST": 2, "TRADE": 2 }
    //       }
    //     ]

    // 2. BY MODEL — group-by done in JS (dataset is tiny; at scale this moves into
    //    a Postgres view/RPC). Nested default-then-upgrade accumulator.
    const { data: decisionRows, error: decisionsError } = await supabase
        .from('decisions')
        .select('agent_model, action')
        .eq('run_id', id)
    // note: decisions table -> for every run's every turn's every agent, has its own row

    if (decisionsError) {
        return NextResponse.json({ error: decisionsError.message }, { status: 500 })
    }

    const byModel: Record<string, Record<string, number>> = {}
    for (const { agent_model, action } of decisionRows ?? []) {
        byModel[agent_model] ??= {} // new agent found, initalize 
        byModel[agent_model][action] = (byModel[agent_model][action] ?? 0) + 1 // add count to each action given an agent
    }

    // shape: 
    // "byModel": {
    // "claude-haiku-4-5": { "FARM": 3, "MINE": 2, "REST": 4 },
    // "gpt-4o-mini":      { "MINE": 1, "REST": 2, "TRADE": 2 }
    // }
    //

    // Empty run → { timeline: [], byModel: {} } with 200 (empty result is success).
    return NextResponse.json({ timeline, byModel })
}
