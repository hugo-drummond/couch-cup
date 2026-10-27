import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { createMatchToken } from '@/lib/tokens'
import { sendScheduleConfirmationEmail, sendAdminFlagEmail } from '@/lib/email'
import { sendRoundEmails, checkRoundCompletion } from '@/lib/tournament-advance'

interface TokenRow {
  id: string
  player_id: string
  match_id: string
  type: string
  expires_at: string
  used_at: string | null
}

interface BracketRow {
  participant_a_id: string
  participant_b_id: string
  scheduled_at: string | null
  winner_id: string | null
  tournament_id: string
  round_number: number
}

interface ParticipantRow {
  id: string
  name: string
  email: string
  psn_id: string
}

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 })

  const rows = await sql<TokenRow>(
    `SELECT id, player_id, match_id, type, expires_at, used_at
     FROM public.match_tokens
     WHERE token = $1 AND type IN ('forfeit_accept', 'forfeit_decline')`,
    [token]
  )

  if (!rows.length) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  const row = rows[0]
  if (row.used_at) return NextResponse.json({ error: 'already_used' }, { status: 410 })
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  const action = row.type === 'forfeit_accept' ? 'accept' : 'decline'
  const now = new Date().toISOString()

  // Mark this token used + invalidate the sibling forfeit token for this player/match
  await sql(`UPDATE public.match_tokens SET used_at = $1 WHERE id = $2`, [now, row.id])
  await sql(
    `UPDATE public.match_tokens SET used_at = $1
     WHERE match_id = $2 AND player_id = $3
       AND type IN ('forfeit_accept', 'forfeit_decline') AND used_at IS NULL AND id != $4`,
    [now, row.match_id, row.player_id, row.id]
  )

  const brackets = await sql<BracketRow>(
    `SELECT participant_a_id, participant_b_id, scheduled_at, winner_id, tournament_id, round_number
     FROM public.brackets WHERE id = $1`,
    [row.match_id]
  )
  if (!brackets.length) return NextResponse.json({ error: 'match_not_found' }, { status: 404 })
  const bracket = brackets[0]

  // Already resolved (e.g. opponent already declined, or score window closed)
  if (bracket.winner_id) {
    return NextResponse.json({ ok: true, action, status: 'already_resolved' })
  }

  const participants = await sql<ParticipantRow>(
    `SELECT id, name, email, psn_id FROM public.participants WHERE id IN ($1, $2)`,
    [bracket.participant_a_id, bracket.participant_b_id]
  )
  const lessAvail = participants.find(p => p.id === row.player_id)!
  const moreAvail = participants.find(p => p.id !== row.player_id)!

  if (action === 'accept') {
    if (!bracket.scheduled_at) {
      return NextResponse.json({ ok: true, action: 'accepted', status: 'already_resolved' })
    }
    // Match is already active + scheduled. Both players are now locked in:
    // mint each a score-submission token and confirm the time to both.
    const lessToken = await createMatchToken(lessAvail.id, row.match_id, 'submission', 48)
    const moreToken = await createMatchToken(moreAvail.id, row.match_id, 'submission', 48)
    await Promise.all([
      sendScheduleConfirmationEmail(
        lessAvail.email, lessAvail.name.split(' ')[0], moreAvail.psn_id, bracket.scheduled_at, lessToken
      ),
      sendScheduleConfirmationEmail(
        moreAvail.email, moreAvail.name.split(' ')[0], lessAvail.psn_id, bracket.scheduled_at, moreToken
      ),
    ])
    return NextResponse.json({ ok: true, action: 'accepted', status: 'scheduled' })
  }

  // Decline — less-available player forfeits, more-available player advances
  await sql(
    `UPDATE public.brackets
     SET winner_id = $1, status = 'completed', completed_at = now(),
         forfeit_reason = 'Opponent declined the auto-scheduled time'
     WHERE id = $2`,
    [moreAvail.id, row.match_id]
  )
  await sql(`UPDATE public.participants SET status = 'eliminated' WHERE id = $1`, [lessAvail.id])
  // Invalidate any outstanding score-submission tokens for this match
  await sql(
    `UPDATE public.match_tokens SET used_at = $1
     WHERE match_id = $2 AND type = 'submission' AND used_at IS NULL`,
    [now, row.match_id]
  )

  await sendRoundEmails(moreAvail, lessAvail, bracket.tournament_id, bracket.round_number)
  await sendAdminFlagEmail(
    `Forfeit — opponent declined time — match ${row.match_id}`,
    `${lessAvail.name} declined the auto-scheduled time. ${moreAvail.name} advances by forfeit.`
  )

  await checkRoundCompletion(bracket.tournament_id, bracket.round_number)

  return NextResponse.json({ ok: true, action: 'declined', status: 'forfeited' })
}
