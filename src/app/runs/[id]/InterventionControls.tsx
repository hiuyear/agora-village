'use client'

import { useEffect, useState } from 'react'

// Observer intervention controls. Only the creator (who holds the raw token) can
// fire a shock; everyone else sees a view-only note. The token is kept in
// localStorage keyed by runId — NOT in the URL — so the shareable link stays
// safe to hand out (a viewer's browser simply has no token).

type Shock = 'drought' | 'boom' | 'plague'

const SHOCKS: { type: Shock; label: string; hint: string; className: string }[] = [
    { type: 'drought', label: '🌵 Drought', hint: 'food halved', className: 'border-orange-200 hover:bg-orange-50' },
    { type: 'boom', label: '🌱 Boom', hint: '+5 food, +5 ore', className: 'border-green-200 hover:bg-green-50' },
    { type: 'plague', label: '☠️ Plague', hint: 'all resources ×0.7', className: 'border-red-200 hover:bg-red-50' },
]

function tokenKey(runId: string) {
    return `creatorToken:${runId}`
}

export default function InterventionControls({ runId }: { runId: string }) {
    // null until we've read localStorage on the client (see mount effect below).
    const [token, setToken] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [showUnlock, setShowUnlock] = useState(false)
    const [tokenInput, setTokenInput] = useState('')
    const [busy, setBusy] = useState<Shock | null>(null)
    const [msg, setMsg] = useState<string | null>(null)

    // localStorage only exists in the browser — read it AFTER mount so server
    // and first client render agree (no hydration mismatch).
    useEffect(() => {
        setToken(localStorage.getItem(tokenKey(runId)))
        setMounted(true)
    }, [runId])

    function saveToken() {
        const t = tokenInput.trim()
        if (!t) return
        localStorage.setItem(tokenKey(runId), t)
        setToken(t)
        setShowUnlock(false)
        setTokenInput('')
        setMsg(null)
    }

    function clearToken() {
        localStorage.removeItem(tokenKey(runId))
        setToken(null)
        setMsg(null)
    }

    async function fire(type: Shock) {
        if (!token) return
        setBusy(type)
        setMsg(null)
        try {
            const res = await fetch(`/api/runs/${runId}/intervene`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-creator-token': token,
                },
                body: JSON.stringify({ event_type: type }),
            })
            const data = await res.json()
            if (res.status === 201) {
                setMsg(`✓ ${type} scheduled for turn ${data.turn_number}`)
            } else if (res.status === 403) {
                setMsg('✗ Wrong creator token — cleared. Re-enter to unlock.')
                clearToken()
            } else if (res.status === 401) {
                setMsg('✗ Missing token.')
            } else {
                setMsg(`✗ ${data.error ?? 'Failed to schedule intervention'}`)
            }
        } catch {
            setMsg('✗ Network error.')
        } finally {
            setBusy(null)
        }
    }

    // Avoid rendering the viewer/creator split until we know which one we are,
    // so we never flash "view-only" at the actual creator.
    if (!mounted) return null

    return (
        <div>
            {token ? (
                <>
                    <div className="flex flex-wrap gap-2">
                        {SHOCKS.map(({ type, label, hint, className }) => (
                            <button
                                key={type}
                                onClick={() => fire(type)}
                                disabled={busy !== null}
                                className={`rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-40 ${className}`}
                                title={hint}
                            >
                                <span className="font-medium">{label}</span>
                                <span className="ml-1 text-xs text-gray-500">· {hint}</span>
                            </button>
                        ))}
                    </div>
                    <button onClick={clearToken} className="mt-2 text-xs text-gray-400 underline">
                        forget creator token (become viewer)
                    </button>
                </>
            ) : showUnlock ? (
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="password"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveToken()}
                        placeholder="paste creator token"
                        className="rounded border border-gray-200 px-2 py-1 text-sm"
                    />
                    <button onClick={saveToken} className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white">
                        Unlock
                    </button>
                    <button onClick={() => setShowUnlock(false)} className="text-xs text-gray-400">
                        cancel
                    </button>
                </div>
            ) : (
                <p className="text-sm text-gray-500">
                    Viewing as observer.{' '}
                    <button onClick={() => setShowUnlock(true)} className="underline">
                        I&apos;m the creator
                    </button>
                </p>
            )}

            {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}
        </div>
    )
}
