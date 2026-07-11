'use client'

// App-wide error boundary. Next.js renders this (as a client component) when a
// server or client render throws, instead of showing a blank/crashed page.
// `reset()` re-attempts the render — useful for transient failures (e.g. a brief
// DB blip) without a full page reload.
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-gray-500">
                An unexpected error occurred while loading this page.
            </p>
            <button
                onClick={reset}
                className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
            >
                Try again
            </button>
        </main>
    )
}
