import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { verifyInviteToken } from '@/lib/invite-tokens'

interface TournamentRow {
  name: string
  game: string
  prize: string | null
  status: string
}

async function loadTournament(id: string): Promise<TournamentRow | null> {
  const rows = await sql<TournamentRow>(
    `SELECT name, game, prize, status FROM public.tournaments WHERE id = $1 LIMIT 1`,
    [id]
  )
  return rows[0] ?? null
}

// GET — render data for the /invite/[token] page.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 })

  const decoded = verifyInviteToken(token)
  if (!decoded) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })

  const t = await loadTournament(decoded.tournamentId)
  if (!t) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })

  return NextResponse.json({
    tournamentName: t.name,
    game: t.game,
    prize: t.prize,
    open: t.status === 'registration',
  })
}

// POST — record the recipient's choice (signup / not_interested), tournament-scoped.
export async function POST(req: NextRequest) {
  const { token, action, epicUsername, partner_gaming_id, partner_email } = await req.json()
  if (!token || !['signup', 'not_interested'].includes(action)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  // Signup captures the game handle (Epic username for Fortnite) stored per-tournament.
  const gamingId = typeof epicUsername === 'string' ? epicUsername.trim() : ''
  if (action === 'signup' && !gamingId) {
    return NextResponse.json({ error: 'missing_username' }, { status: 400 })
  }

  const decoded = verifyInviteToken(token)
  if (!decoded) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })

  const t = await loadTournament(decoded.tournamentId)
  if (!t) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  if (t.status !== 'registration') return NextResponse.json({ error: 'closed' }, { status: 410 })

  const email = decoded.email

  // Partner (duos) — optional. If a partner username is named, an email is required
  // (only way to reach them) and neither may point back at the submitter.
  let partnerRef: string | null = null
  let partnerEmailNorm: string | null = null
  if (action === 'signup') {
    partnerRef = typeof partner_gaming_id === 'string' ? (partner_gaming_id.trim() || null) : null
    partnerEmailNorm = typeof partner_email === 'string' ? (partner_email.trim().toLowerCase() || null) : null
    if (partnerRef) {
      const pl = partnerRef.toLowerCase()
      if (pl === gamingId.toLowerCase() || pl === email.toLowerCase()) {
        return NextResponse.json({ error: 'partner_self' }, { status: 400 })
      }
      if (!partnerEmailNorm) {
        return NextResponse.json({ error: 'partner_email_required' }, { status: 400 })
      }
    }
    if (partnerEmailNorm && partnerEmailNorm === email.toLowerCase()) {
      return NextResponse.json({ error: 'partner_self' }, { status: 400 })
    }
  }

  // Lazy player resolve/create. Marketing recipients may be participants-only
  // (no players row); their gaming_id is sourced from the participant record so
  // players.gaming_id (NOT NULL) is satisfied.
  let playerId = (await sql<{ id: string }>(
    `SELECT id FROM public.players WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
    [email]
  ))[0]?.id

  if (!playerId) {
    const part = (await sql<{ name: string; psn_id: string }>(
      `SELECT name, psn_id FROM public.participants WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
      [email]
    ))[0]
    const name = part?.name ?? email.split('@')[0]
    const gamingId = part?.psn_id ?? null
    if (!gamingId) return NextResponse.json({ error: 'no_profile' }, { status: 422 })

    try {
      playerId = (await sql<{ id: string }>(
        `INSERT INTO public.players (name, email, gaming_id, marketing_opt_in)
         VALUES ($1, $2, $3, true) RETURNING id`,
        [name, email, gamingId]
      ))[0]?.id
    } catch {
      // Unique collision on email or gaming_id — re-resolve to an existing player.
      playerId = (await sql<{ id: string }>(
        `SELECT id FROM public.players
         WHERE lower(trim(email)) = lower(trim($1)) OR gaming_id = $2 LIMIT 1`,
        [email, gamingId]
      ))[0]?.id
    }
    if (!playerId) return NextResponse.json({ error: 'player_failed' }, { status: 500 })
  }

  // Any row (waitlist or not_interested) stops future nudges for THIS tournament.
  // Toggle freely between waitlist ⇄ not_interested, but never clobber an engaged
  // state (selected/accepted/bracket/eliminated/winner/flagged).
  if (action === 'signup') {
    await sql(
      `INSERT INTO public.waitlist_entries (player_id, tournament_id, status, gaming_id, partner_ref, partner_email)
       VALUES ($1, $2, 'waitlist', $3, $4, $5)
       ON CONFLICT (player_id, tournament_id) DO UPDATE
         SET status = 'waitlist', gaming_id = EXCLUDED.gaming_id,
             partner_ref = EXCLUDED.partner_ref, partner_email = EXCLUDED.partner_email
         WHERE public.waitlist_entries.status IN ('waitlist', 'not_interested')`,
      [playerId, decoded.tournamentId, gamingId, partnerRef, partnerEmailNorm]
    )
  } else {
    // not_interested — leave any previously captured gaming_id untouched.
    await sql(
      `INSERT INTO public.waitlist_entries (player_id, tournament_id, status)
       VALUES ($1, $2, 'not_interested')
       ON CONFLICT (player_id, tournament_id) DO UPDATE
         SET status = 'not_interested'
         WHERE public.waitlist_entries.status IN ('waitlist', 'not_interested')`,
      [playerId, decoded.tournamentId]
    )
  }

  return NextResponse.json({ ok: true, action })
}
