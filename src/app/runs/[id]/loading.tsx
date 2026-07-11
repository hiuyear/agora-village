// Shown automatically (via Suspense) while the run page's server-side fetch runs.
export default function Loading() {
    return (
        <main className="mx-auto max-w-3xl p-8">
            <header className="mb-8">
                <div className="flex items-center gap-3">
                    <div className="h-7 w-56 animate-pulse rounded bg-gray-200" />
                    <div className="h-6 w-20 animate-pulse rounded-full bg-gray-100" />
                </div>
                <div className="mt-2 h-4 w-40 animate-pulse rounded bg-gray-100" />
            </header>
            <div className="space-y-4">
                <div className="h-32 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
                <div className="h-48 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
            </div>
        </main>
    )
}
