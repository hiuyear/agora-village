import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest, {params}: {params: {id: string}}){
    const {id} = params
    
    const {data, error} = await supabase.from('runs').select('*').eq('id',id).single()

    if (error){
        return NextResponse.json({error: error.message}, {status: 500})
    }
    
    if (!data){
        return NextResponse.json({ error: 'Run not found'}, {status: 404})
    }

    return NextResponse.json(data)
}