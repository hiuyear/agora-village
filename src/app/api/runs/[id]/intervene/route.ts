import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireCreator } from '@/lib/auth'
import { InterventionSchema } from '@/lib/simulation'

// POST /api/runs/[id]/intervene
// Records an observer shock (drought/boom/plague). It does NOT mutate the world
// itself — the effect is applied by the NEXT advanceTurn (deferred-effect,
// decision #17), keeping advanceTurn the single source of state transitions.
// rmb that TURN # must be derived from supabase (not from API params)
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const { id } = params

    const authError = await requireCreator(request, id)
    if (authError) return authError

    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({error: 'invalid JSON body'}, {status: 400})}

    // validate with Zod (untrusted input) 
    const parsed = InterventionSchema.safeParse(body) // note: safeParse returns a result obj
    if (!parsed.success) return NextResponse.json({error: "Invalid intercention", details: parsed.error.flatten() }, {status: 400})


    const {data: lastTurn} = await supabase
        .from('turns')
        .select('*')
        .eq('run_id', id)
        .order('turn_number', {ascending: false})
        .limit(1)
        .maybeSingle()

    const targetTurn = (lastTurn?.turn_number ?? 0) + 1

    // insert into "interventions": { run_id: id, turn_number: targetTurn,
    const {error} = await supabase
        .from('interventions')
        .insert({ 
            run_id: id, 
            turn_number: targetTurn,
            event_type: parsed.data.event_type, 
            parameters: parsed.data.parameters ?? null 
        })

    if (error) return NextResponse.json({error: 'InteractionEvent insertion error'}, {status: 500})

    return NextResponse.json(
        { scheduled: true, event_type: parsed.data.event_type, turn_number: targetTurn },
        { status: 201 }
    )
}
