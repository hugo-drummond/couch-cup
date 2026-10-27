import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { validateToken, markTokenUsed, createMatchToken } from '@/lib/tokens'
import { sendScheduleConfirmationEmail, sendResubmitAvailabilityEmail, sendNoOverlapSuggestionEmail, sendAdminFlagEmail, sendForfeitWarningEmail, sendAvailabilityConfirmationEmail } from '@/lib/email'
import { toMinutes, minutesToTime, findOverlap, suggestTime, closestSchedulableTime, staggerStart, sastParts } from '@/lib/scheduling'

const MAX_SUGGESTION_GAP_MINUTES = 240 // 4 hours
const S1_ID = 'cc76b2fc-32db-4760-b7a2-83c608a03964'

interface AvailabilityRow { player_id: string; date: string; start_time: string; end_time: string }
interface ParticipantRow { id: string; name: string; email: string; psn_id: string }
interface RoundRow { play_window_start: string; play_window_end: string; round_name: string; scheduling_deadline: string }
interface MatchRow { tournament_id: string; round_number: number }
interface Window { date: string; startTime: string; endTime: string }

async function sendResubmitToBoth(matchId: string, playerA: ParticipantRow, playerB: ParticipantRow) {
  await sql(`DELETE FROM public.match_availability WHERE match_id = $1`, [matchId])
  await sql(`UPDATE public.brackets SET proposed_time_ts = NULL, decline_count = GREATEST(decline_count, 1) WHERE id = $1`, [matchId])

  const tokenA = await createMatchToken(playerA.id, matchId, 'scheduling', 24)
  const tokenB = await createMatchToken(playerB.id, matchId, 'scheduling', 24)

  await Promise.all([
    sendResubmitAvailabilityEmail(playerA.email, playerA.name.split(' ')[0], tokenA),
    sendResubmitAvailabilityEmail(playerB.email, playerB.name.split(' ')[0], tokenB),
  ])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const token: string = body.token
  const windows: Window[] = body.windows ?? (body.date ? [{ date: body.date, startTime: body.startTime, endTime: body.endTime }] : [])

  if (!token || !windows.length) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  for (const w of windows) {
    if (!w.date || !w.startTime || !w.endTime) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
  }

  const validation = await validateToken(token, 'scheduling')
  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 410 })
  }

  const { playerId, matchId, tokenId } = validation

  // Fetch match + round for play window validation
  const matchRows = await sql<MatchRow>(
    `SELECT tournament_id, round_number FROM public.brackets WHERE id = $1`, [matchId]
  )
  const roundRows = await sql<RoundRow>(
    `SELECT play_window_start, play_window_end, round_name, scheduling_deadline
     FROM public.rounds WHERE tournament_id = $1 AND round_number = $2`,
    [matchRows[0]?.tournament_id, matchRows[0]?.round_number]
  )
  const round = roundRows[0] ?? null

  // Validate submitted windows are fully within the play window (full datetime check)
  if (round) {
    const windowStart = new Date(round.play_window_start)
    const windowEnd = new Date(round.play_window_end)
    for (const w of windows) {
      const submitStart = new Date(`${w.date}T${w.startTime}:00+02:00`)
      const submitEnd = new Date(`${w.date}T${w.endTime}:00+02:00`)
      if (submitStart < windowStart || submitEnd > windowEnd) {
        return NextResponse.json({ error: 'time_outside_window' }, { status: 400 })
      }
    }
  }

  // Weekday/weekend hour constraints (SAST = UTC+2): Mon–Fri 18:00–23:00, Sat–Sun 08:00–24:00
  for (const w of windows) {
    const dow = new Date(`${w.date}T12:00:00+02:00`).getDay() // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6
    const minMins = isWeekend ? 8 * 60 : 18 * 60
    const maxMins = isWeekend ? 24 * 60 : 23 * 60
    const [sh, sm] = w.startTime.split(':').map(Number)
    const [eh, em] = w.endTime.split(':').map(Number)
    const startMins = sh * 60 + sm
    const endMins = eh === 0 && em === 0 ? 24 * 60 : eh * 60 + em
    if (startMins < minMins || endMins > maxMins) {
      return NextResponse.json({ error: 'time_outside_allowed_hours' }, { status: 400 })
    }
  }

  // Check not already submitted
  const existing = await sql<{ id: string }>(
    `SELECT id FROM public.match_availability WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId]
  )
  if (existing.length) {
    return NextResponse.json({ error: 'already_submitted' }, { status: 409 })
  }

  for (const w of windows) {
    await sql(
      `INSERT INTO public.match_availability (match_id, player_id, date, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [matchId, playerId, w.date, w.startTime, w.endTime]
    )
  }

  await markTokenUsed(tokenId)

  // Save the player's YouTube channel (optional). Stored on the global players
  // record (keyed by email) so we never ask the same person again. Don't overwrite.
  const youtubeUrl = typeof body.youtubeUrl === 'string' ? body.youtubeUrl.trim() : ''
  if (youtubeUrl) {
    await sql(
      `UPDATE public.players SET youtube_url = $1
       WHERE lower(email) = (SELECT lower(email) FROM public.participants WHERE id = $2)
         AND (youtube_url IS NULL OR youtube_url = '')`,
      [youtubeUrl, playerId]
    )
  }

  // Confirm to the player exactly which slots they just submitted.
  const submitter = await sql<{ name: string; email: string }>(
    `SELECT name, email FROM public.participants WHERE id = $1`, [playerId]
  )
  if (submitter[0]) {
    await sendAvailabilityConfirmationEmail(submitter[0].email, submitter[0].name.split(' ')[0], windows)
  }

  // Check if opponent has also submitted
  const allWindows = await sql<AvailabilityRow>(
    `SELECT player_id, date, start_time, end_time FROM public.match_availability WHERE match_id = $1`,
    [matchId]
  )

  const playerIds = [...new Set(allWindows.map(w => w.player_id))]
  if (playerIds.length < 2) {
    return NextResponse.json({ ok: true, status: 'waiting_for_opponent' })
  }

  const windowsA = allWindows.filter(w => w.player_id === playerIds[0]).map(w => ({ date: w.date, start: toMinutes(w.start_time), end: toMinutes(w.end_time) }))
  const windowsB = allWindows.filter(w => w.player_id === playerIds[1]).map(w => ({ date: w.date, start: toMinutes(w.start_time), end: toMinutes(w.end_time) }))

  // Get bracket state (decline_count) + both participants
  const bracketMeta = await sql<{ decline_count: number }>(`SELECT decline_count FROM public.brackets WHERE id = $1`, [matchId])
  const declineCount = bracketMeta[0]?.decline_count ?? 0

  const participants = await sql<ParticipantRow>(`
    SELECT p.id, p.name, p.email, p.psn_id
    FROM public.brackets b
    JOIN public.participants p ON p.id = b.participant_a_id OR p.id = b.participant_b_id
    WHERE b.id = $1
  `, [matchId])

  const playerA = participants.find(p => p.id === playerIds[0])!
  const playerB = participants.find(p => p.id === playerIds[1])!

  // Find overlap
  let overlap = null
  for (const a of windowsA) {
    for (const b of windowsB) {
      const o = findOverlap({ date: a.date, start: a.start, end: a.end }, { date: b.date, start: b.start, end: b.end })
      if (o) { overlap = o; break }
    }
    if (overlap) break
  }

  if (overlap) {
    const STAGGER_ROUNDS = new Set(['Round of 16', 'Quarter-finals', 'Semi-finals'])
    let startMin = overlap.start
    if (round?.round_name && STAGGER_ROUNDS.has(round.round_name)) {
      const siblings = await sql<{ scheduled_at: string }>(
        `SELECT scheduled_at FROM public.brackets
         WHERE tournament_id = $1 AND round_number = $2 AND id <> $3 AND scheduled_at IS NOT NULL`,
        [matchRows[0]?.tournament_id, matchRows[0]?.round_number, matchId]
      )
      const taken = siblings
        .map((s) => sastParts(s.scheduled_at))
        .filter((s) => s.date === overlap.date)
        .map((s) => s.minutes)
      startMin = staggerStart(overlap.start, overlap.end, taken)
    }
    const scheduledAt = new Date(`${overlap.date}T${minutesToTime(startMin)}:00+02:00`).toISOString()

    await sql(
      `INSERT INTO public.scheduled_matches (match_id, scheduled_at)
       VALUES ($1, $2)
       ON CONFLICT (match_id) DO UPDATE SET scheduled_at = $2, confirmed_at = now()`,
      [matchId, scheduledAt]
    )
    await sql(
      `UPDATE public.brackets SET status = 'active', scheduled_at = $1, score_due_at = $1::timestamptz + interval '4 hours' WHERE id = $2`,
      [scheduledAt, matchId]
    )

    const tokenA = await createMatchToken(playerA.id, matchId, 'submission', 48)
    const tokenB = await createMatchToken(playerB.id, matchId, 'submission', 48)

    await Promise.all([
      sendScheduleConfirmationEmail(playerA.email, playerA.name.split(' ')[0], playerB.psn_id, scheduledAt, tokenA),
      sendScheduleConfirmationEmail(playerB.email, playerB.name.split(' ')[0], playerA.psn_id, scheduledAt, tokenB),
    ])

    return NextResponse.json({ ok: true, status: 'scheduled', scheduledAt })
  }

  // No overlap — after a prior decline, auto-schedule within the more-available player's window
  if (declineCount >= 1) {
    const totalMin = (id: string) => allWindows.filter(w => w.player_id === id).reduce((s, w) => s + toMinutes(w.end_time) - toMinutes(w.start_time), 0)
    const minA = totalMin(playerA.id)
    const minB = totalMin(playerB.id)
    const lessAvail = minA <= minB ? playerA : playerB
    const moreAvail = minA <= minB ? playerB : playerA
    const moreWindows = allWindows.filter(w => w.player_id === moreAvail.id)
    const lessWindows = allWindows.filter(w => w.player_id === lessAvail.id)
    const bestSlot = closestSchedulableTime(moreWindows, lessWindows)
    const scheduledAt = bestSlot
      ? new Date(`${bestSlot.date}T${bestSlot.startTime}:00+02:00`).toISOString()
      : round?.play_window_start ?? new Date().toISOString()
    await sql(
      `INSERT INTO public.scheduled_matches (match_id, scheduled_at)
       VALUES ($1, $2)
       ON CONFLICT (match_id) DO UPDATE SET scheduled_at = $2, confirmed_at = now()`,
      [matchId, scheduledAt]
    )
    await sql(
      `UPDATE public.brackets SET status = 'active', scheduled_at = $1, score_due_at = $1::timestamptz + interval '4 hours' WHERE id = $2`,
      [scheduledAt, matchId]
    )
    const acceptToken  = await createMatchToken(lessAvail.id, matchId, 'forfeit_accept', 24)
    const declineToken = await createMatchToken(lessAvail.id, matchId, 'forfeit_decline', 24)
    await Promise.all([
      sendForfeitWarningEmail(lessAvail.email, lessAvail.name.split(' ')[0], moreAvail.psn_id, scheduledAt, acceptToken, declineToken),
      sendAdminFlagEmail(`Auto-scheduled after decline — match ${matchId}`, `${moreAvail.name} had more availability. Scheduled at ${scheduledAt}. ${lessAvail.name} asked to accept or forfeit.`),
    ])
    return NextResponse.json({ ok: true, status: 'auto_scheduled' })
  }

  // Season 1 round 3+: skip the suggested-time step, go straight to resubmit.
  if (matchRows[0]?.tournament_id === S1_ID && (matchRows[0]?.round_number ?? 0) >= 3) {
    await sendResubmitToBoth(matchId, playerA, playerB)
    return NextResponse.json({ ok: true, status: 'resubmit_sent' })
  }

  // No overlap, first time through — try to suggest a time
  const suggested = suggestTime(windowsA, windowsB)

  // Reject suggestion if: no same-day windows, gap too large, or outside play window
  const suggestedAt = suggested
    ? new Date(`${suggested.date}T${minutesToTime(suggested.minutes)}:00+02:00`).toISOString()
    : null

  const suggestionValid = suggested &&
    suggested.gapMinutes <= MAX_SUGGESTION_GAP_MINUTES &&
    (!round || (new Date(suggestedAt!) >= new Date(round.play_window_start) && new Date(suggestedAt!) <= new Date(round.play_window_end)))

  if (!suggestionValid) {
    await sendResubmitToBoth(matchId, playerA, playerB)
    if (!suggested) {
      await sendAdminFlagEmail(
        `No same-day availability — match ${matchId}`,
        `${playerA.name} and ${playerB.name} submitted availability on different days. Resubmit emails sent.`
      )
    }
    return NextResponse.json({ ok: true, status: 'resubmit_sent' })
  }

  // Valid suggestion — send proposal emails
  const suggestedLabel = new Date(suggestedAt!).toLocaleString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Africa/Johannesburg',
  })

  await sql(`UPDATE public.brackets SET proposed_time_ts = $1 WHERE id = $2`, [suggestedAt, matchId])

  const acceptA  = await createMatchToken(playerA.id, matchId, 'proposal_accept',  24)
  const declineA = await createMatchToken(playerA.id, matchId, 'proposal_decline', 24)
  const acceptB  = await createMatchToken(playerB.id, matchId, 'proposal_accept',  24)
  const declineB = await createMatchToken(playerB.id, matchId, 'proposal_decline', 24)

  await Promise.all([
    sendNoOverlapSuggestionEmail(playerA.email, playerA.name.split(' ')[0], suggestedLabel, acceptA, declineA),
    sendNoOverlapSuggestionEmail(playerB.email, playerB.name.split(' ')[0], suggestedLabel, acceptB, declineB),
  ])

  return NextResponse.json({ ok: true, status: 'suggestion_sent', suggestedAt })
}
