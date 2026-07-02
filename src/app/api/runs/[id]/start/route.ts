import { NextRequest, NextResponse } from 'next/server'
import { advanceTurn } from '@/lib/simulation'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest, {params}: {params: {id: string}}) {

    const {id} = params

    const body = await request.json()

    // retrieve status & config from supabase using id
    const { data: run, error } = await supabase
        .from('runs')
        .select('status, config')
        .eq('id', id)
        .single()

    if (error || !run){
        return NextResponse.json({error: error.message}, { status: 500})
    }

    // double-start guartd - prevent from running when already running, else update with "running"
    if (run.status === 'running') {
        return NextResponse.json({ error: 'Run already in progress' }, { status: 409 })
        // note: 409 is status code for "the request is valid but conflicts with current state." 
    } else {
        const {error: runningError} = await supabase.from('runs').update({ status: 'running' }).eq('id', id)
        if (runningError) {
            return NextResponse.json({error: 'unable to update running status'}, { status: 500})
        }
    }

    let turns
    if (body.turns !== undefined){
        // if body is provided, ie. turn number (body has shape {turns: n})
        turns = body.turns
    } else {
        turns = run.config.turns
    }

    try {
        for (let i = 0; i < turns; i++) {
            await advanceTurn(id)
        }
        const {error: completedError} = await supabase.from('runs').update({ status: 'completed' }).eq('id', id)
        if (completedError){
            return NextResponse.json({error: 'Unable to update completed status'}, {status: 500})
        }
    } catch (e) {
        await supabase.from('runs').update({ status: 'error' }).eq('id', id)
        return NextResponse.json({ error: 'Simulation failed' }, { status: 500 })
    }

    return NextResponse.json({ status: 'completed', turnsRun: turns })
}