import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sql } from '@/lib/supabase'
import { validateToken } from '@/lib/tokens'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const token = form.get('token')
  const file = form.get('file')

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 })
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'invalid_mime' }, { status: 415 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }

  const validation = await validateToken(token, 'submission')
  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 410 })
  }

  const { playerId, matchId } = validation

  const brackets = await sql<{ tournament_id: string }>(
    `SELECT tournament_id FROM public.brackets WHERE id = $1`,
    [matchId]
  )
  if (!brackets.length) return NextResponse.json({ error: 'match_not_found' }, { status: 404 })
  const { tournament_id } = brackets[0]

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${tournament_id}/${matchId}/${playerId}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from('match-screenshots')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ path })
}
