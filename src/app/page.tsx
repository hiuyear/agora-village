import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Landing page: a list of every simulation run, newest first. Server component
// — fetches on the server, ships no client JS (the live bits live per-run).
export const dynamic = 'force-dynamic'

function statusColor(status: string): string {
    switch (status) {
        case 'completed': return 'bg-green-100 text-green-800'
        case 'running': return 'bg-blue-100 text-blue-800'
        case 'error': return 'bg-red-100 text-red-800'
        default: return 'bg-gray-100 text-gray-700' // pending
    }
}

type RunRow = {
    id: string
    name: string
    status: string
    created_at: string
    config: { agents?: { name: string }[] } | null
}

export default async function Home() {
    // Explicit columns only — never select('*') on a table that holds
    // creator_token (bcrypt hash). Same rule enforced across the API routes.
    const { data: runs } = await supabase
        .from('runs')
        .select('id, name, status, created_at, config')
        .order('created_at', { ascending: false })
        .limit(50)

    const rows = (runs ?? []) as RunRow[]

    return (
        <main className="mx-auto max-w-3xl p-8">
            <header className="mb-8">
                <h1 className="text-2xl font-bold">Agora Village</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Autonomous LLM agents in an economic simulation. Pick a run to watch live.
                </p>
            </header>

            {rows.length === 0 ? (
                <p className="text-gray-500">
                    No runs yet. Create one via <code>POST /api/runs</code>, then start it.
                </p>
            ) : (
                <ul className="space-y-2">
                    {rows.map((run) => {
                        const agentCount = run.config?.agents?.length ?? 0
                        return (
                            <li key={run.id}>
                                <Link
                                    href={`/runs/${run.id}`}
                                    className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:bg-gray-50"
                                >
                                    <div>
                                        <div className="font-medium">{run.name}</div>
                                        <div className="text-xs text-gray-400">
                                            {agentCount} agents · {new Date(run.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor(run.status)}`}>
                                        {run.status}
                                    </span>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </main>
    )
}
