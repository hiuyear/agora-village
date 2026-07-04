import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireCreator } from '@/lib/auth'

// Always read fresh from the DB — never serve a cached snapshot.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, {params}: {params: {id: string}}){
    const {id} = params

    const {data, error} = await supabase.from('runs').select('id, created_at, name, status, config, current_turn').eq('id',id).maybeSingle()

    if (error){
        return NextResponse.json({error: error.message}, {status: 500})
    }

    if (!data){
        return NextResponse.json({ error: 'Run not found'}, {status: 404})
    }

    return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, {params}: {params: {id:string}}) {
    // postgres auto deletes child rows, so deleting from runs table => delete from turns table, etc
    const {id} = params

    const authError = await requireCreator(request, id)

    // failed auth
    if (authError) return authError // requireCreator already returns a response object of the error itself

    // pass
    const {error} = await supabase
        .from('runs')
        .delete()
        .eq('id', id)

    if (error){
        return NextResponse.json({error: 'deletion failed'}, {status: 500})
    }

    return NextResponse.json({deleted: true}, {status: 200})
}
