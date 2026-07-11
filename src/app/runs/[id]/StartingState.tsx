'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Shown when a run is `running` (or `pending`) but has produced 0 turns yet —
// e.g. the durable workflow was just handed the run and turn 1 is still cooking.
// The page is a server component, so it won't update on its own; this polls with
// router.refresh() until the first turn lands, at which point the server component
// re-renders with turns > 0 and swaps in the live view. No manual refresh needed.
export default function StartingState({ status }: { status: string }) {
    const router = useRouter()

    useEffect(() => {
        const interval = setInterval(() => router.refresh(), 2500)
        return () => clearInterval(interval)
    }, [router])

    const message =
        status === 'running'
            ? 'Simulation running — waiting for the first turn to land…'
            : 'Simulation queued — waiting for it to start…'

    return (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-5 text-gray-500">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" aria-hidden />
            <span className="text-sm">{message}</span>
        </div>
    )
}
