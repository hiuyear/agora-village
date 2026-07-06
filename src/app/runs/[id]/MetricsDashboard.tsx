// Research dashboard — Gini/trade-rate timeline + per-model action breakdown.
// Pure presentational SERVER component: the run page fetches the data and passes
// it in, so this renders on the server (no loading flash) and ships zero client JS.
// The line chart is hand-rolled SVG — no charting dependency for two simple lines.

export type TimelinePoint = {
    turn_number: number
    gini: number
    tradeRate: number
    actionDist: Record<string, number>
}

// Known actions in a stable column order; any unexpected action is appended after.
const ACTION_ORDER = ['FARM', 'MINE', 'TRADE', 'REST']

// --- SVG chart geometry -----------------------------------------------------
const W = 640
const H = 220
const PAD = { top: 10, right: 12, bottom: 26, left: 34 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

// x for the i-th point of n; single point sits centered
function xAt(i: number, n: number): number {
    return PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
}
// y for a value in [0,1]; 0 at the bottom, 1 at the top
function yAt(v: number): number {
    return PAD.top + (1 - v) * plotH
}

function modelBadge(model: string): string {
    if (model.startsWith('claude')) return 'bg-purple-100 text-purple-800'
    if (model.startsWith('gpt')) return 'bg-emerald-100 text-emerald-800'
    return 'bg-gray-100 text-gray-700'
}

function LineSeries({ values, color }: { values: number[]; color: string }) {
    const n = values.length
    const points = values.map((v, i) => `${xAt(i, n)},${yAt(v)}`).join(' ')
    return (
        <>
            {/* the line (skip if only one point — nothing to connect) */}
            {n > 1 && <polyline points={points} fill="none" stroke={color} strokeWidth={2} />}
            {/* a dot per turn, so single-turn runs still render something */}
            {values.map((v, i) => (
                <circle key={i} cx={xAt(i, n)} cy={yAt(v)} r={2.5} fill={color} />
            ))}
        </>
    )
}

export default function MetricsDashboard({
    timeline,
    byModel,
}: {
    timeline: TimelinePoint[]
    byModel: Record<string, Record<string, number>>
}) {
    if (timeline.length === 0) {
        return <p className="text-sm text-gray-500">No metrics yet — start the run to generate them.</p>
    }

    // summary stats
    const finalGini = timeline[timeline.length - 1].gini
    const avgTradeRate = timeline.reduce((s, t) => s + t.tradeRate, 0) / timeline.length

    // chart series
    const giniValues = timeline.map((t) => t.gini)
    const tradeValues = timeline.map((t) => t.tradeRate)
    const n = timeline.length
    const yTicks = [0, 0.25, 0.5, 0.75, 1]
    // show at most ~8 x-labels so they don't overlap on long runs
    const labelEvery = Math.max(1, Math.ceil(n / 8))

    // model table: union of all actions seen, ordered by ACTION_ORDER then extras
    const seen = new Set<string>()
    for (const actions of Object.values(byModel)) {
        for (const a of Object.keys(actions)) seen.add(a)
    }
    const actionCols = [
        ...ACTION_ORDER.filter((a) => seen.has(a)),
        ...Array.from(seen).filter((a) => !ACTION_ORDER.includes(a)),
    ]

    return (
        <div className="space-y-6">
            {/* --- summary stat cards --- */}
            <div className="grid grid-cols-3 gap-3">
                <Stat label="Final Gini" value={finalGini.toFixed(3)} hint="0 = equal · 1 = one agent owns all gold" />
                <Stat label="Avg trade rate" value={avgTradeRate.toFixed(2)} hint="mean fraction of agents trading / turn" />
                <Stat label="Turns" value={String(n)} hint="metric samples on record" />
            </div>

            {/* --- Gini + trade-rate over time --- */}
            <div className="rounded-lg border border-gray-200 p-5">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Inequality &amp; trade over time</h3>
                    <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" /> Gini
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Trade rate
                        </span>
                    </div>
                </div>

                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gini and trade rate per turn">
                    {/* y gridlines + labels (0..1) */}
                    {yTicks.map((v) => (
                        <g key={v}>
                            <line x1={PAD.left} y1={yAt(v)} x2={W - PAD.right} y2={yAt(v)} stroke="#f1f5f9" strokeWidth={1} />
                            <text x={PAD.left - 6} y={yAt(v) + 3} textAnchor="end" className="fill-gray-400" fontSize={9}>
                                {v}
                            </text>
                        </g>
                    ))}
                    {/* x labels (turn numbers) */}
                    {timeline.map((t, i) =>
                        i % labelEvery === 0 || i === n - 1 ? (
                            <text key={t.turn_number} x={xAt(i, n)} y={H - 8} textAnchor="middle" className="fill-gray-400" fontSize={9}>
                                {t.turn_number}
                            </text>
                        ) : null
                    )}
                    {/* the two series */}
                    <LineSeries values={giniValues} color="#6366f1" />
                    <LineSeries values={tradeValues} color="#10b981" />
                </svg>
            </div>

            {/* --- per-model action breakdown --- */}
            <div className="rounded-lg border border-gray-200 p-5">
                <h3 className="mb-3 text-sm font-semibold">Actions by model</h3>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-400">
                            <th className="font-normal">Model</th>
                            {actionCols.map((a) => (
                                <th key={a} className="font-normal">{a}</th>
                            ))}
                            <th className="font-normal">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(byModel).map(([model, actions]) => {
                            const total = Object.values(actions).reduce((s, c) => s + c, 0)
                            return (
                                <tr key={model} className="border-t border-gray-100">
                                    <td className="py-1.5">
                                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${modelBadge(model)}`}>
                                            {model}
                                        </span>
                                    </td>
                                    {actionCols.map((a) => (
                                        <td key={a} className="tabular-nums">{actions[a] ?? '·'}</td>
                                    ))}
                                    <td className="tabular-nums font-medium">{total}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-400">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
            <div className="mt-1 text-[10px] leading-tight text-gray-400">{hint}</div>
        </div>
    )
}
