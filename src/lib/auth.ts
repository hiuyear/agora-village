import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

// called by protected route handlers
export async function requireCreator(request: NextRequest, runId: string): Promise<NextResponse | null>{
    const token = request.headers.get('x-creator-token') // read credential
    if (!token) return NextResponse.json({error: 'unable to retrieve token'}, {status: 401})

    const {data: run, error} = await supabase
        .from('runs')
        .select('creator_token')
        .eq('id', runId)
        .single()

    if (error) return NextResponse.json({error: 'run not found'}, {status: 404})

    const same = await bcrypt.compare(token, run.creator_token) 

    if (!same){
        return NextResponse.json({authError: 'tokens do not match'}, {status: 403})
    } else {
        return null
    }
}