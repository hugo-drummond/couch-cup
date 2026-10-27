import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { sendYoutubeSetupEmail } from '@/lib/email'

interface TokenRow {
  id: string
  player_id: string
  tournament_id: string
  type: string
  expires_at: string
  used_at: string | null
  player_name: string
  player_email: string
  tournament_name: string
  game: string
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 })

  const rows = await sql<TokenRow>(`
    SELECT
      pt.id, pt.player_id, pt.tournament_id, pt.type, pt.expires_at, pt.used_at,
      p.name AS player_name,
      t.name AS tournament_name,
      t.game
    FROM public.player_tokens pt
    JOIN public.players p ON p.id = pt.player_id
    JOIN public.tournaments t ON t.id = pt.tournament_id
    WHERE pt.token = $1 AND pt.type = 'acceptance'
  `, [token])

  if (!rows.length) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })

  const row = rows[0]
  if (row.used_at) return NextResponse.json({ error: 'already_used' }, { status: 410 })
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  return NextResponse.json({
    playerName: row.player_name,
    tournamentName: row.tournament_name,
    game: row.game,
  })
}

export async function POST(req: NextRequest) {
  const { token, action } = await req.json()

  if (!token || !['accept', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const rows = await sql<TokenRow>(`
    SELECT pt.id, pt.player_id, pt.tournament_id, pt.used_at, pt.expires_at,
           p.name AS player_name, p.email AS player_email, t.name AS tournament_name, t.game
    FROM public.player_tokens pt
    JOIN public.players p ON p.id = pt.player_id
    JOIN public.tournaments t ON t.id = pt.tournament_id
    WHERE pt.token = $1 AND pt.type = 'acceptance'
  `, [token])

  if (!rows.length) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })

  const row = rows[0]
  if (row.used_at) return NextResponse.json({ error: 'already_used' }, { status: 410 })
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  const status = action === 'accept' ? 'accepted' : 'declined'
  const now = new Date().toISOString()

  await sql(
    `UPDATE public.waitlist_entries
     SET status = $1, accepted_at = $2
     WHERE player_id = $3 AND tournament_id = $4`,
    [status, now, row.player_id, row.tournament_id]
  )

  await sql(
    `UPDATE public.player_tokens SET used_at = $1 WHERE id = $2`,
    [now, row.id]
  )

  // YouTube streaming setup email fires only on acceptance.
  // Idempotent: skip if one was already logged for this email (covers players
  // promoted before the invite-time send was removed). Non-blocking: a send
  // failure must not fail the accept response.
  if (action === 'accept') {
    try {
      const already = await sql<{ one: number }>(
        `SELECT 1 AS one
         FROM public.email_logs el
         JOIN public.participants pa ON pa.id = el.participant_id
         WHERE el.email_type = 'youtube_setup'
           AND lower(pa.email) = lower($1)
         LIMIT 1`,
        [row.player_email]
      )
      if (!already.length) {
        await sendYoutubeSetupEmail(row.player_email, (row.player_name || '').split(' ')[0] || 'there')
      }
    } catch (e) {
      console.error('[respond] youtube setup email failed:', e)
    }
  }

  return NextResponse.json({ ok: true, action })
}
