import { supabase } from '@/lib/supabase'
import ReplayViewer from './ReplayViewer'
import type { DecisionRow, TurnRow } from './ReplayViewer'

// Always render fresh — this is live simulation data, never a cached snapshot.
export const dynamic = 'force-dynamic'

// small style helper --------------------------------------------------------
function statusColor(status: string): string {
    switch (status) {
        case 'completed': return 'bg-green-100 text-green-800'
        case 'running': return 'bg-blue-100 text-blue-800'
        case 'error': return 'bg-red-100 text-red-800'
        default: return 'bg-gray-100 text-gray-700' // pending
    }
}

export default async function RunPage({ params }: { params: { id: string } }) {
    const { id } = params

    // 1. the run itself (name, status, config)
    const { data: run } = await supabase
        .from('runs')
        .select('name, status, config')
        .eq('id', id)
        .maybeSingle()

    if (!run) {
        return (
            <main className="mx-auto max-w-2xl p-8">
                <h1 className="text-xl font-semibold">Run not found</h1>
                <p className="text-gray-500">No run exists with id <code>{id}</code>.</p>
            </main>
        )
    }

    // 2. every turn snapshot, oldest first
    const { data: turns } = await supabase
        .from('turns')
        .select('turn_number, state')
        .eq('run_id', id)
        .order('turn_number', { ascending: true })

    // 3. every decision, oldest first
    const { data: decisions } = await supabase
        .from('decisions')
        .select('turn_number, agent_id, agent_model, action, reasoning, target, offer, request')
        .eq('run_id', id)
        .order('turn_number', { ascending: true })

    // Group decisions by turn_number into a PLAIN OBJECT (not a Map): this gets
    // passed as a prop into the client <ReplayViewer/>, and only plain
    // objects/arrays/primitives survive the server→client serialization.
    const decisionsByTurn: Record<number, DecisionRow[]> = {}
    for (const d of (decisions ?? []) as DecisionRow[]) {
        ;(decisionsByTurn[d.turn_number] ??= []).push(d)
    }

    const agentNames: string[] = run.config?.agents?.map((a: { name: string }) => a.name) ?? []
    const turnRows = (turns ?? []) as TurnRow[]

    return (
        <main className="mx-auto max-w-3xl p-8">
            {/* header */}
            <header className="mb-8">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">{run.name}</h1>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor(run.status)}`}>
                        {run.status}
                    </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                    {agentNames.length} agents · {turnRows.length} turns
                </p>
            </header>

            {/* no turns yet → nothing to replay */}
            {turnRows.length === 0 ? (
                <p className="text-gray-500">No turns yet — this run hasn’t been started.</p>
            ) : (
                <ReplayViewer turns={turnRows} decisionsByTurn={decisionsByTurn} />
            )}
        </main>
    )
}
