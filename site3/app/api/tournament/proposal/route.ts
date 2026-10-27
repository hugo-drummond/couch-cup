import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { createMatchToken } from '@/lib/tokens'
import { sendScheduleConfirmationEmail, sendResubmitAvailabilityEmail } from '@/lib/email'

interface TokenRow {
  id: string
  player_id: string
  match_id: string
  type: string
  expires_at: string
  used_at: string | null
}

interface ParticipantRow {
  id: string
  name: string
  email: string
  psn_id: string
}

interface BracketRow {
  proposed_time_ts: string | null
  participant_a_id: string
  participant_b_id: string
  decline_count: number
}

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 })

  const rows = await sql<TokenRow>(
    `SELECT id, player_id, match_id, type, expires_at, used_at
     FROM public.match_tokens
     WHERE token = $1 AND type IN ('proposal_accept', 'proposal_decline')`,
    [token]
  )

  if (!rows.length) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  const row = rows[0]
  if (row.used_at) return NextResponse.json({ error: 'already_used' }, { status: 410 })
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  const action = row.type === 'proposal_accept' ? 'accept' : 'decline'
  const now = new Date().toISOString()

  // Mark this token used + invalidate sibling token for same player
  await sql(`UPDATE public.match_tokens SET used_at = $1 WHERE id = $2`, [now, row.id])
  await sql(
    `UPDATE public.match_tokens SET used_at = $1
     WHERE match_id = $2 AND player_id = $3
       AND type IN ('proposal_accept', 'proposal_decline') AND used_at IS NULL AND id != $4`,
    [now, row.match_id, row.player_id, row.id]
  )

  const brackets = await sql<BracketRow>(
    `SELECT proposed_time_ts, participant_a_id, participant_b_id, decline_count FROM public.brackets WHERE id = $1`,
    [row.match_id]
  )
  if (!brackets.length) return NextResponse.json({ error: 'match_not_found' }, { status: 404 })
  const bracket = brackets[0]

  const participants = await sql<ParticipantRow>(
    `SELECT id, name, email, psn_id FROM public.participants WHERE id IN ($1, $2)`,
    [bracket.participant_a_id, bracket.participant_b_id]
  )
  const playerA = participants.find(p => p.id === bracket.participant_a_id)!
  const playerB = participants.find(p => p.id === bracket.participant_b_id)!

  if (action === 'decline') {
    // Invalidate all remaining proposal tokens for this match
    await sql(
      `UPDATE public.match_tokens SET used_at = $1
       WHERE match_id = $2 AND type IN ('proposal_accept', 'proposal_decline') AND used_at IS NULL`,
      [now, row.match_id]
    )

    if (bracket.decline_count === 0) {
      // First decline — ask both to resubmit
      await sql(`UPDATE public.brackets SET proposed_time_ts = NULL, decline_count = 1 WHERE id = $1`, [row.match_id])
      await sql(`DELETE FROM public.match_availability WHERE match_id = $1`, [row.match_id])

      const tokenA = await createMatchToken(playerA.id, row.match_id, 'scheduling', 24)
      const tokenB = await createMatchToken(playerB.id, row.match_id, 'scheduling', 24)

      await Promise.all([
        sendResubmitAvailabilityEmail(playerA.email, playerA.name.split(' ')[0], tokenA),
        sendResubmitAvailabilityEmail(playerB.email, playerB.name.split(' ')[0], tokenB),
      ])

      return NextResponse.json({ ok: true, action: 'declined', status: 'resubmit_requested' })
    }

    // decline_count >= 1: scheduling already resolved by the availability route's
    // auto-forfeit (no second proposal is ever issued). Tokens are invalidated above; no-op.
    return NextResponse.json({ ok: true, action: 'declined', status: 'already_resolved' })
  }

  // Accept path — guard: proposed_time_ts must still be set (not cleared by a prior decline)
  if (!bracket.proposed_time_ts) {
    return NextResponse.json({ ok: true, action: 'accepted', status: 'already_resolved' })
  }

  // Check if other player also accepted. A genuine decline always clears
  // proposed_time_ts (line ~81), so reaching here guarantees no real decline —
  // the other player's used proposal_accept token therefore means they accepted.
  // (Don't gate on used proposal_decline tokens: accepting force-uses the
  // player's own sibling decline token, which would falsely block scheduling.)
  const otherAccept = await sql<{ id: string }>(
    `SELECT mt.id FROM public.match_tokens mt
     WHERE mt.match_id = $1
       AND mt.type = 'proposal_accept'
       AND mt.used_at IS NOT NULL
       AND mt.player_id != $2`,
    [row.match_id, row.player_id]
  )

  if (!otherAccept.length) {
    return NextResponse.json({ ok: true, action: 'accepted', status: 'waiting_for_opponent' })
  }

  // Both accepted — schedule
  const scheduledAt = bracket.proposed_time_ts
  await sql(
    `INSERT INTO public.scheduled_matches (match_id, scheduled_at)
     VALUES ($1, $2)
     ON CONFLICT (match_id) DO UPDATE SET scheduled_at = $2, confirmed_at = now()`,
    [row.match_id, scheduledAt]
  )
  await sql(
    `UPDATE public.brackets SET status = 'active', scheduled_at = $1, proposed_time_ts = NULL,
     score_due_at = $1::timestamptz + interval '4 hours' WHERE id = $2`,
    [scheduledAt, row.match_id]
  )

  const scoreTokenA = await createMatchToken(playerA.id, row.match_id, 'submission', 48)
  const scoreTokenB = await createMatchToken(playerB.id, row.match_id, 'submission', 48)

  await Promise.all([
    sendScheduleConfirmationEmail(playerA.email, playerA.name.split(' ')[0], playerB.psn_id, scheduledAt, scoreTokenA),
    sendScheduleConfirmationEmail(playerB.email, playerB.name.split(' ')[0], playerA.psn_id, scheduledAt, scoreTokenB),
  ])

  return NextResponse.json({ ok: true, action: 'accepted', status: 'scheduled', scheduledAt })
}
