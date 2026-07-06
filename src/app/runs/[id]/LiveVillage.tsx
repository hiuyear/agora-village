'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import type { SimState, Inventory } from './ReplayViewer'

// LIVE village view. The server page fetches the latest turn once and passes it
// as `initialState`; from then on this component owns the state, updating it
// from Realtime INSERTs on the `turns` table (decision #14 pattern: fetch on the
// server, interact/subscribe on the client).

// One row shape we read off the Realtime payload. Supabase sends the whole new
// row as `payload.new`; we only care about turn_number + state.
type TurnRow = { turn_number: number; state: SimState }

// Per-resource colour, matched to the action palette already used elsewhere.
const RESOURCE_META: { key: keyof Inventory; label: string; bar: string }[] = [
    { key: 'food', label: '🌾 food', bar: 'bg-lime-400' },
    { key: 'ore', label: '⛏️ ore', bar: 'bg-amber-400' },
    { key: 'gold', label: '💰 gold', bar: 'bg-yellow-500' },
]

export default function LiveVillage({
    runId,
    initialState,
}: {
    runId: string
    initialState: SimState
}) {
    const [state, setState] = useState<SimState>(initialState)
    // subscription lifecycle, surfaced as a small live/connecting dot.
    const [connected, setConnected] = useState(false)

    useEffect(() => {
        // A channel is a named subscription. We filter server-side to just this
        // run's turns, so the browser is only woken for rows it cares about.
        const channel = supabaseBrowser
            .channel(`run:${runId}:turns`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'turns',
                    filter: `run_id=eq.${runId}`,
                },
                (payload) => {
                    const row = payload.new as TurnRow
                    // Guard against out-of-order delivery: only move forward.
                    setState((prev) => (row.state.turn >= prev.turn ? row.state : prev))
                }
            )
            .subscribe((status) => {
                setConnected(status === 'SUBSCRIBED')
            })

        // Cleanup: tear the subscription down on unmount / runId change so we
        // don't leak channels (each would keep a live listener on the socket).
        return () => {
            supabaseBrowser.removeChannel(channel)
        }
    }, [runId])

    const agents = Object.entries(state.agents)

    // Scale each resource bar relative to the current max holder of THAT
    // resource, so bars are comparable within a column. Floor of 1 avoids /0.
    const maxByResource: Record<keyof Inventory, number> = {
        food: Math.max(1, ...agents.map(([, inv]) => inv.food)),
        ore: Math.max(1, ...agents.map(([, inv]) => inv.ore)),
        gold: Math.max(1, ...agents.map(([, inv]) => inv.gold)),
    }

    return (
        <section className="rounded-lg border border-gray-200 p-5">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Village · turn {state.turn}</h2>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span
                        className={`inline-block h-2 w-2 rounded-full ${
                            connected ? 'animate-pulse bg-green-500' : 'bg-gray-300'
                        }`}
                    />
                    {connected ? 'live' : 'connecting…'}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {agents.map(([name, inv]) => (
                    <div key={name} className="rounded-lg border border-gray-100 p-4">
                        <div className="mb-3 font-medium">{name}</div>
                        <div className="space-y-2">
                            {RESOURCE_META.map(({ key, label, bar }) => (
                                <div key={key}>
                                    <div className="mb-0.5 flex justify-between text-xs text-gray-500">
                                        <span>{label}</span>
                                        <span className="tabular-nums">{inv[key]}</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${bar}`}
                                            style={{ width: `${(inv[key] / maxByResource[key]) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}
