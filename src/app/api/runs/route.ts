import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest){
    const body = await request.json()
    const name = body.name
    const config = body.config
    const creatorToken = crypto.randomUUID()
    const hashedToken = await bcrypt.hash(creatorToken, 10)

    const { data, error } = await supabase
        .from('runs')
        .insert({ name, creator_token: hashedToken, config, status: "pending"})
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, creatorToken }, { status: 201 })
}

export async function GET(request: NextRequest){

    const { searchParams } = request.nextUrl // example GET call: 
    const limit = Math.min(Number(searchParams.get('limit')) || 10, 50) // set default as 10 if limit not provided in URL; cap at 50
    const offset = Number(searchParams.get('offset')) || 0 // # of rows to SKIP from top of ordered list

    const { data, error } = await supabase
    .from('runs')
    .select('id, created_at, name, status, config, current_turn')
    .order( 'created_at' , {ascending: false} )             // newest-first ordering
    .range(offset, offset + limit - 1)

    if (error) {          
        return NextResponse.json( { error: 'Unable to retrieve runs'} , { status: 500 })
    }

    return NextResponse.json(data)
}