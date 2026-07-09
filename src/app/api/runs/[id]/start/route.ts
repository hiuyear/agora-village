import { NextRequest, NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { runSimulationWorkflow } from '@/workflows/runSimulations'
import { supabase } from '@/lib/supabase'
import { requireCreator } from '@/lib/auth'

export async function POST(request: NextRequest, {params}: {params: {id: string}}) {

    const {id} = params

    const authError = await requireCreator(request, id)
    if (authError) return authError

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

    // double-start guartd - prevent from running when already running
    if (run.status === 'running') {
        return NextResponse.json({ error: 'Run already in progress' }, { status: 409 })
        // note: 409 is status code for "the request is valid but conflicts with current state." 
    }
    

    const turns = body.turns !== undefined ? body.turns : run.config.turns

    await supabase.from('runs').update({ status: 'running' }).eq('id', id)
    await start(runSimulationWorkflow, [id, turns])   // hand off to the durable job

    return NextResponse.json({ status: 'running', runId: id, turns }, { status: 202 })
}