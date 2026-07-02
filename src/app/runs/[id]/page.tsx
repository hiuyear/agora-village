import { supabase } from '@/lib/supabase'

// Always render fresh — this is live simulation data, never a cached snapshot.
export const dynamic = 'force-dynamic'

// --- local types (the Supabase client is untyped, so we describe shapes here) ---
type Inventory = { food: number; ore: number; gold: number }
type SimState = { turn: number; agents: Record<string, Inventory> }
type DecisionRow = {
    turn_number: number
    agent_id: string
    agent_model: string
    action: string
    reasoning: string
    target: string | null
    offer: { resource: string; amount: number } | null
    request: { resource: string; amount: number } | null
}

// small style helpers -------------------------------------------------------
function statusColor(status: string): string {
    switch (status) {
        case 'completed': return 'bg-green-100 text-green-800'
        case 'running': return 'bg-blue-100 text-blue-800'
        case 'error': return 'bg-red-100 text-red-800'
        default: return 'bg-gray-100 text-gray-700' // pending
    }
}

function actionColor(action: string): string {
    switch (action) {
        case 'FARM': return 'bg-lime-100 text-lime-800'
        case 'MINE': return 'bg-amber-100 text-amber-800'
        case 'TRADE': return 'bg-purple-100 text-purple-800'
        case 'REST': return 'bg-slate-100 text-slate-700'
        default: return 'bg-gray-100 text-gray-700'
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

    // group decisions by turn_number so we can render them under each turn
    const decisionsByTurn = new Map<number, DecisionRow[]>()
    for (const d of (decisions ?? []) as DecisionRow[]) {
        const list = decisionsByTurn.get(d.turn_number) ?? []
        list.push(d)
        decisionsByTurn.set(d.turn_number, list)
    }

    const agentNames: string[] = run.config?.agents?.map((a: { name: string }) => a.name) ?? []

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
                    {agentNames.length} agents · {turns?.length ?? 0} turns
                </p>
            </header>

            {/* no turns yet */}
            {(!turns || turns.length === 0) && (
                <p className="text-gray-500">No turns yet — this run hasn’t been started.</p>
            )}

            {/* one card per turn */}
            <div className="space-y-6">
                {turns?.map((t) => {
                    const state = t.state as SimState
                    const turnDecisions = decisionsByTurn.get(t.turn_number) ?? []
                    return (
                        <section key={t.turn_number} className="rounded-lg border border-gray-200 p-5">
                            <h2 className="mb-4 text-lg font-semibold">Turn {t.turn_number}</h2>

                            {/* what each agent decided */}
                            <div className="space-y-3">
                                {turnDecisions.map((d) => (
                                    <div key={d.agent_id} className="flex flex-col gap-1 border-l-2 border-gray-100 pl-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{d.agent_id}</span>
                                            <span className="text-xs text-gray-400">{d.agent_model}</span>
                                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${actionColor(d.action)}`}>
                                                {d.action}
                                            </span>
                                            {d.action === 'TRADE' && d.target && d.offer && d.request && (
                                                <span className="text-xs text-gray-500">
                                                    → {d.target}: give {d.offer.amount} {d.offer.resource}, get {d.request.amount} {d.request.resource}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 italic">“{d.reasoning}”</p>
                                    </div>
                                ))}
                            </div>

                            {/* resulting inventories */}
                            <div className="mt-4 border-t border-gray-100 pt-3">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-gray-400">
                                            <th className="font-normal">Agent</th>
                                            <th className="font-normal">🌾 food</th>
                                            <th className="font-normal">⛏️ ore</th>
                                            <th className="font-normal">💰 gold</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(state.agents).map(([name, inv]) => (
                                            <tr key={name}>
                                                <td className="font-medium">{name}</td>
                                                <td>{inv.food}</td>
                                                <td>{inv.ore}</td>
                                                <td>{inv.gold}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )
                })}
            </div>
        </main>
    )
}
