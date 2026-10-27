import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { validateToken, markTokenUsed } from '@/lib/tokens'
import { sendAdminFlagEmail, sendScoreConfirmationEmail } from '@/lib/email'
import { checkRoundCompletion, triggerRematch } from '@/lib/tournament-advance'

interface ScoreReport {
  reporter_id: string
  claimed_winner: string | null
  score_reporter: number
  score_opponent: number
}

interface Participant {
  id: string
  name: string
  email: string
  psn_id: string
}

interface BracketRow {
  participant_a_id: string
  participant_b_id: string
  tournament_id: string
  round_number: number
  status: string
  winner_id: string | null
  score_due_at: string | null
}

export async function POST(req: NextRequest) {
  const { token, goalsFor, goalsAgainst, streamUrl, screenshotUrl, screenshotPath } = await req.json()

  if (!token || goalsFor === undefined || goalsAgainst === undefined) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  if (typeof goalsFor !== 'number' || typeof goalsAgainst !== 'number' || goalsFor < 0 || goalsAgainst < 0) {
    return NextResponse.json({ error: 'invalid_scores' }, { status: 400 })
  }

  const validation = await validateToken(token, 'submission')
  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 410 })
  }

  const { playerId, matchId, tokenId } = validation

  const matchRows = await sql<BracketRow>(
    `SELECT participant_a_id, participant_b_id, tournament_id, round_number, status, winner_id, score_due_at FROM public.brackets WHERE id = $1`,
    [matchId]
  )
  if (!matchRows.length) return NextResponse.json({ error: 'match_not_found' }, { status: 404 })
  const match = matchRows[0]

  // Match already resolved (cron auto-resolved, or both submitted)
  if (match.winner_id || match.status === 'completed') {
    return NextResponse.json({ error: 'already_resolved' }, { status: 409 })
  }

  // Submission window (4 hours from scheduled time) has closed
  if (match.score_due_at && new Date(match.score_due_at) < new Date()) {
    return NextResponse.json({ error: 'window_closed' }, { status: 403 })
  }

  // Guard against double submission (race condition + double-click)
  const existing = await sql<{ id: string }>(
    `SELECT id FROM public.score_reports WHERE bracket_id = $1 AND reporter_id = $2`,
    [matchId, playerId]
  )
  if (existing.length) return NextResponse.json({ error: 'already_submitted' }, { status: 409 })

  const opponentId = match.participant_a_id === playerId ? match.participant_b_id : match.participant_a_id
  const isDraw = goalsFor === goalsAgainst
  // Draws have no winner yet — use null; unequal scores determine winner normally
  const claimedWinnerId = isDraw ? null : (goalsFor > goalsAgainst ? playerId : opponentId)

  await sql(
    `INSERT INTO public.score_reports (bracket_id, reporter_id, claimed_winner, score_reporter, score_opponent, went_to_penalties, stream_url, screenshot_url, screenshot_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [matchId, playerId, claimedWinnerId, goalsFor, goalsAgainst, false, streamUrl ?? null, screenshotUrl ?? null, screenshotPath ?? null]
  )

  await markTokenUsed(tokenId)

  const participants = await sql<Participant>(
    `SELECT id, name, email, psn_id FROM public.participants WHERE id IN ($1, $2)`,
    [match.participant_a_id, match.participant_b_id]
  )

  // Send score confirmation to the submitting player only
  const submitter = participants.find(p => p.id === playerId)
  const opponent = participants.find(p => p.id !== playerId)
  if (submitter && opponent) {
    const submitterFirstName = submitter.name.split(' ')[0]
    const scoreLink = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://couchcup.co.za'}/match/${token}`
    await sendScoreConfirmationEmail(
      submitter.email,
      submitterFirstName,
      goalsFor,
      goalsAgainst,
      opponent.psn_id,
      scoreLink
    )
  }

  const reports = await sql<ScoreReport>(
    `SELECT reporter_id, claimed_winner, score_reporter, score_opponent
     FROM public.score_reports WHERE bracket_id = $1`,
    [matchId]
  )

  if (reports.length < 2) {
    return NextResponse.json({ ok: true, status: 'waiting_for_opponent' })
  }

  const [rA, rB] = reports

  // Both agree it's a draw — trigger rematch
  const bothDraw = rA.claimed_winner === null && rB.claimed_winner === null
  if (bothDraw) {
    await triggerRematch(matchId)
    return NextResponse.json({ ok: true, status: 'draw_rematch' })
  }

  // One says draw, other says winner — treat as conflict
  if (rA.claimed_winner === null || rB.claimed_winner === null) {
    await sql(`UPDATE public.brackets SET dispute_flag = true, dispute_status = 'pending_review' WHERE id = $1`, [matchId])
    await sql(`INSERT INTO public.admin_reviews (match_id, requested_by, reason) VALUES ($1, 'system', 'Score conflict between players')`, [matchId])
    await sendAdminFlagEmail(
      `Score conflict, match ${matchId}`,
      `${participants[0].name} and ${participants[1].name} submitted conflicting scores (one reported a draw, one reported a winner).\n\n` +
      `${rA.reporter_id}: ${rA.score_reporter}-${rA.score_opponent}\n` +
      `${rB.reporter_id}: ${rB.score_reporter}-${rB.score_opponent}`
    )
    return NextResponse.json({ ok: true, status: 'conflict_flagged' })
  }

  const scoresMatch = rA.claimed_winner === rB.claimed_winner

  const winner = participants.find(p => p.id === rA.claimed_winner)!
  const loser = participants.find(p => p.id !== rA.claimed_winner)!

  if (scoresMatch) {
    // Normalise scores to participant_a / participant_b ordering
    const isReporterA = rA.reporter_id === match.participant_a_id
    const score_a = isReporterA ? rA.score_reporter : rA.score_opponent
    const score_b = isReporterA ? rA.score_opponent : rA.score_reporter

    await sql(
      `UPDATE public.brackets
       SET winner_id = $1, status = 'completed', completed_at = now(),
           score_a = $2, score_b = $3, reported_by_a = true, reported_by_b = true
       WHERE id = $4`,
      [winner.id, score_a, score_b, matchId]
    )

    await sql(`UPDATE public.participants SET status = 'eliminated' WHERE id = $1`, [loser.id])

    // Hold result emails and next-round generation for manual release via release script
    // sendRoundEmails() is called from the release script when result_alert_sent is false

    await checkRoundCompletion(match.tournament_id, match.round_number)

    return NextResponse.json({ ok: true, status: 'resolved', winnerId: winner.id })
  }

  // Conflict
  await sql(`UPDATE public.brackets SET dispute_flag = true, dispute_status = 'pending_review' WHERE id = $1`, [matchId])
  await sql(`INSERT INTO public.admin_reviews (match_id, requested_by, reason) VALUES ($1, 'system', 'Score conflict between players')`, [matchId])

  await sendAdminFlagEmail(
    `Score conflict, match ${matchId}`,
    `${participants[0].name} and ${participants[1].name} submitted conflicting scores.\n\n` +
    `${rA.reporter_id}: ${rA.score_reporter}-${rA.score_opponent} (claimed winner: ${rA.claimed_winner})\n` +
    `${rB.reporter_id}: ${rB.score_reporter}-${rB.score_opponent} (claimed winner: ${rB.claimed_winner})`
  )

  return NextResponse.json({ ok: true, status: 'conflict_flagged' })
}
