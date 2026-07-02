import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
        // Next.js caches fetch() by default in the App Router, which makes
        // Supabase reads return stale data. Force every request to bypass it.
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
})
