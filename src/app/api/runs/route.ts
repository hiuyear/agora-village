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
    const { data, error } = await supabase
    .from('runs')
    .select('id, created_at, name, status, config, current_turn')
    .order( 'created_at' , {ascending: false} )             // newest-first ordering

    if (error) {          
        return NextResponse.json( { error: 'Unable to retrieve runs'} , { status: 500 })
    }


    return NextResponse.json(data)
}