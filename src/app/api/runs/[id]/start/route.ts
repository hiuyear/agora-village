import { NextRequest, NextResponse } from 'next/server'
import { advanceTurn } from '@/lib/simulation'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest, {params}: {params: {id: string}}) {

    const {id} = params

    const body = await request.json()

    let turns
    if (body.turns !== undefined){
        turns = body.turns
    } else {
        // config.turns from the DB
        const { data, error } = await supabase
            .from('runs')
            .select('config')
            .eq('id', id)
            .single()

        turns = data.config.turns
    }

    for (let i = 0; i < turns; i++){
        await advanceTurn(id)
    }

    return NextResponse.json({})
}