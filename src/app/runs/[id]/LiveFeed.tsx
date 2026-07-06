'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import type { DecisionRow } from './ReplayViewer'

// Rolling live feed of agent reasoning. Seeded by the server with the most
// recent decisions (newest first); new decisions.INSERT rows are prepended as
// advanceTurn writes them, capped at MAX_FEED so the log stays short.

const MAX_FEED = 10

function actionColor(action: string): string {
    switch (action) {
        case 'FARM': return 'bg-lime-100 text-lime-800'
        case 'MINE': return 'bg-amber-100 text-amber-800'
        case 'TRADE': return 'bg-purple-100 text-purple-800'
        case 'REST': return 'bg-slate-100 text-slate-700'
        default: return 'bg-gray-100 text-gray-700'
    }
}

export default function LiveFeed({
    runId,
    initialFeed,
}: {
    runId: string
    // newest-first, already capped by the server
    initialFeed: DecisionRow[]
}) {
    const [feed, setFeed] = useState<DecisionRow[]>(initialFeed)

    useEffect(() => {
        const channel = supabaseBrowser
            .channel(`run:${runId}:decisions`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'decisions',
                    filter: `run_id=eq.${runId}`,
                },
                (payload) => {
                    const row = payload.new as DecisionRow
                    // prepend newest, drop the oldest past MAX_FEED
                    setFeed((prev) => [row, ...prev].slice(0, MAX_FEED))
                }
            )
            .subscribe()

        return () => {
            supabaseBrowser.removeChannel(channel)
        }
    }, [runId])

    if (feed.length === 0) {
        return <p className="text-sm text-gray-500">No decisions yet.</p>
    }

    return (
        <ul className="space-y-3">
            {feed.map((d, i) => (
                // key includes array position: a run can revisit (agent, turn)
                // pairs across a reset, so agent_id+turn_number isn't unique here.
                <li key={`${d.turn_number}-${d.agent_id}-${i}`} className="border-l-2 border-gray-100 pl-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-gray-400">t{d.turn_number}</span>
                        <span className="font-medium">{d.agent_id}</span>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${actionColor(d.action)}`}>
                            {d.action}
                        </span>
                        {d.action === 'TRADE' && d.target && d.offer && d.request && (
                            <span className="text-xs text-gray-500">
                                → {d.target}: give {d.offer.amount} {d.offer.resource}, get {d.request.amount} {d.request.resource}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 text-sm italic text-gray-600">“{d.reasoning}”</p>
                </li>
            ))}
        </ul>
    )
}
