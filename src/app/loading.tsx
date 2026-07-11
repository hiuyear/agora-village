// Shown automatically (via Suspense) while the home page's server-side fetch runs.
export default function Loading() {
    return (
        <main className="mx-auto max-w-3xl p-8">
            <header className="mb-8">
                <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
                <div className="mt-2 h-4 w-80 animate-pulse rounded bg-gray-100" />
            </header>
            <ul className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <li
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
                    >
                        <div className="space-y-2">
                            <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
                            <div className="h-3 w-28 animate-pulse rounded bg-gray-100" />
                        </div>
                        <div className="h-6 w-16 animate-pulse rounded-full bg-gray-100" />
                    </li>
                ))}
            </ul>
        </main>
    )
}
