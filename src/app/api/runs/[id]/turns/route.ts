import { supabase } from '@/lib/supabase'
import {NextRequest, NextResponse} from 'next/server'

export async function GET(request: NextRequest, {params} : {params: {id: string}}){
    const {id: runId} = params
    const {data, error} = await supabase
        .from('turns')
        .select('*')
        .eq('run_id', runId)
        .order('turn_number', {ascending: true})

    if (error){
        return NextResponse.json({error: 'Unable to load turns from DB'}, {status: 500})
    }

    return NextResponse.json(data)
}