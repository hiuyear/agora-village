'use client'

import { useEffect } from 'react'
import { useState } from 'react'

// --- shared shapes (exported so the server page can reuse them) -------------
// Types are erased at compile time, so a server component importing these from
// a 'use client' file costs nothing at runtime — no client code gets pulled in.
export type Inventory = { food: number; ore: number; gold: number }
export type SimState = { turn: number; agents: Record<string, Inventory> }
export type DecisionRow = {
    turn_number: number
    agent_id: string
    agent_model: string
    action: string
    reasoning: string
    target: string | null
    offer: { resource: string; amount: number } | null
    request: { resource: string; amount: number } | null
}
export type TurnRow = { turn_number: number; state: SimState }

function actionColor(action: string): string {
    switch (action) {
        case 'FARM': return 'bg-lime-100 text-lime-800'
        case 'MINE': return 'bg-amber-100 text-amber-800'
        case 'TRADE': return 'bg-purple-100 text-purple-800'
        case 'REST': return 'bg-slate-100 text-slate-700'
        default: return 'bg-gray-100 text-gray-700'
    }
}

const PLAY_INTERVAL_MS = 1200

export default function ReplayViewer({
    turns,
    decisionsByTurn,
}: {
    turns: TurnRow[]
    decisionsByTurn: Record<number, DecisionRow[]>
}) {
    // `index` is a position in the turns array (0-based), NOT a turn_number.
    // Turn numbers start at 1 and could in theory have gaps; the array index is
    // always a safe 0..lastIndex range for the slider.
    const [index, setIndex] = useState(0)
    const [playing, setPlaying] = useState(false)

    const lastIndex = turns.length - 1
    const current = turns[index]

    // Auto-advance one turn every tick while "playing"; stop at the end.
    useEffect(() => {
        if (!playing) return
        if (index >= lastIndex) {
            setPlaying(false)
            return
        }
        const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, lastIndex)), PLAY_INTERVAL_MS)
        // cleanup: if index/playing changes (or component unmounts) before the
        // tick fires, cancel the pending timer so we don't double-advance.
        return () => clearTimeout(timer)
    }, [playing, index, lastIndex])

    // Left/right arrow keys scrub the replay (pauses autoplay on manual move).
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'ArrowLeft') {
                setPlaying(false)
                setIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'ArrowRight') {
                setPlaying(false)
                setIndex((i) => Math.min(i + 1, lastIndex))
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [lastIndex])

    const turnDecisions = decisionsByTurn[current.turn_number] ?? []
    const state = current.state

    return (
        <div>
            {/* --- transport controls --- */}
            <div className="mb-6 flex items-center gap-3">
                <button
                    onClick={() => { setPlaying(false); setIndex((i) => Math.max(i - 1, 0)) }}
                    disabled={index === 0}
                    className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-40"
                    aria-label="Previous turn"
                >
                    ◀
                </button>

                <button
                    onClick={() => setPlaying((p) => !p)}
                    disabled={index === lastIndex && !playing}
                    className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
                >
                    {playing ? '⏸ Pause' : '▶ Play'}
                </button>

                <button
                    onClick={() => { setPlaying(false); setIndex((i) => Math.min(i + 1, lastIndex)) }}
                    disabled={index === lastIndex}
                    className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-40"
                    aria-label="Next turn"
                >
                    ▶
                </button>

                <input
                    type="range"
                    min={0}
                    max={lastIndex}
                    value={index}
                    onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }}
                    className="flex-1 accent-gray-900"
                    aria-label="Scrub turns"
                />

                <span className="w-24 text-right text-sm tabular-nums text-gray-500">
                    Turn {current.turn_number} / {turns[lastIndex].turn_number}
                </span>
            </div>

            {/* --- the current turn snapshot --- */}
            <section className="rounded-lg border border-gray-200 p-5">
                <h2 className="mb-4 text-lg font-semibold">Turn {current.turn_number}</h2>

                {/* what each agent decided this turn */}
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
                            <p className="text-sm italic text-gray-600">“{d.reasoning}”</p>
                        </div>
                    ))}
                </div>

                {/* resulting inventories after this turn */}
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
        </div>
    )
}
