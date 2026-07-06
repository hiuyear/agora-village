import { createClient } from '@supabase/supabase-js'

// BROWSER Supabase client — safe to import into 'use client' components.
//
// This is deliberately SEPARATE from src/lib/supabase.ts, which uses the
// service-role key (God-mode, bypasses Row-Level Security) and must NEVER reach
// the browser. This client uses the ANON key instead:
//   - the anon key is public by design (it's meant to be shipped to browsers);
//     Row-Level Security is what actually protects the data behind it.
//   - the NEXT_PUBLIC_ prefix is Next.js's explicit opt-in that an env var is
//     safe to expose to client-side code. A var without it never reaches the
//     bundle — so the service key in supabase.ts stays server-only.
//
// We use this client for Realtime: subscribing to Postgres row-changes over a
// WebSocket so the UI updates live as advanceTurn inserts new turns.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Module-level singleton: createClient runs once when this module is first
// imported, and every component shares the one client (and its one WebSocket).
// Making a new client per component would open a new socket each time.
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey)
