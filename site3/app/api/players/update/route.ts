import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'

const DASHBOARD_KEY = process.env.DASHBOARD_KEY
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const { key, id, addedToDiscord, streamUrl, instagram } = await req.json()

    if (!DASHBOARD_KEY || key !== DASHBOARD_KEY) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }

    const stream = typeof streamUrl === 'string' && streamUrl.trim() ? streamUrl.trim() : null
    const insta = typeof instagram === 'string' && instagram.trim() ? instagram.trim() : null

    await sql(
      `UPDATE public.participants
         SET added_to_discord = $1, stream_url = $2, instagram = $3
       WHERE id = $4`,
      [Boolean(addedToDiscord), stream, insta, id]
    )

    return NextResponse.json({ success: true, addedToDiscord: Boolean(addedToDiscord), streamUrl: stream, instagram: insta })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
