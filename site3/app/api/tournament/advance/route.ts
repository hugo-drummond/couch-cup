import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { sendAdminFlagEmail, sendScheduleConfirmationEmail, sendNoOverlapSuggestionEmail, sendResubmitAvailabilityEmail, sendForfeitWarningEmail, sendMatchDayNoticeEmail, sendMatchReminder2h, sendScoreWindowOpenEmail, sendScoreReminderEmail, sendSelectionEmail, sendInviteSenderEmail, sendInviteReceiverEmail, sendPromotionEmail } from '@/lib/email'
import { createMatchToken, createPlayerToken } from '@/lib/tokens'
import { toMinutes, minutesToTime, findOverlap, suggestTime, closestSchedulableTime, staggerStart, sastParts } from '@/lib/scheduling'
import { sendRoundEmails, checkRoundCompletion, triggerRematch } from '@/lib/tournament-advance'

const MAX_SUGGESTION_GAP_MINUTES = 240
const S1_ID = 'cc76b2fc-32db-4760-b7a2-83c608a03964'

export async function GET(req: NextRequest) {
  // Vercel crons send Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const results = { availabilityReconciled: 0, reminders: 0, schedulingFlagged: 0, schedulingAutoAdvanced: 0, scoreWindowOpened: 0, scoreResolved: 0, proposalsAutoConfirmed: 0, selectionsReclaimed: 0, errors: [] as string[] }

  // Acquire a cron lock so overlapping ticks can't double-process or double-email.
  // Stateless HTTP to Supabase rules out session locks, so use an atomic UPDATE on a
  // lock row that auto-expires after 10 min (a crashed tick can't deadlock the cron).
  // If the lock table is missing/unreachable, fail open and run unlocked (status quo).
  let gotLock = true
  try {
    const lock = await sql<{ id: string }>(
      `UPDATE public.cron_lock
       SET locked_at = now(), expires_at = now() + interval '10 minutes'
       WHERE id = 'advance' AND (expires_at IS NULL OR expires_at < now())
       RETURNING id`
    )
    gotLock = lock.length > 0
  } catch (e: any) {
    results.errors.push(`lock-acquire: ${e.message}`)
  }
  if (!gotLock) {
    return NextResponse.json({ skipped: 'another tick is running' })
  }

  try {
    try {
      await checkUnscheduledAvailability(results)
    } catch (e: any) {
      results.errors.push(`availability: ${e.message}`)
    }

    try {
      await checkExpiredSelections(results)
    } catch (e: any) {
      results.errors.push(`selections: ${e.message}`)
    }

    try {
      await checkUpcomingMatchReminders(results)
    } catch (e: any) {
      results.errors.push(`reminders: ${e.message}`)
    }

    try {
      await checkScoreWindowOpen(results)
    } catch (e: any) {
      results.errors.push(`scoreWindow: ${e.message}`)
    }

    try {
      await checkScoreReminders(results)
    } catch (e: any) {
      results.errors.push(`scoreReminder: ${e.message}`)
    }

    try {
      await checkExpiredSchedulingWindows(results)
    } catch (e: any) {
      results.errors.push(`scheduling: ${e.message}`)
    }

    try {
      await checkExpiredScoreWindows(results)
    } catch (e: any) {
      results.errors.push(`scoring: ${e.message}`)
    }

    try {
      await checkExpiredProposals(results)
    } catch (e: any) {
      results.errors.push(`proposals: ${e.message}`)
    }
  } finally {
    try {
      await sql(`UPDATE public.cron_lock SET expires_at = now() WHERE id = 'advance'`)
    } catch {}
  }

  return NextResponse.json(results)
}

async function checkUnscheduledAvailability(results: { availabilityReconciled: number; errors: string[] }) {
  // Race condition recovery: both players submitted availability but scheduling never fired
  const unscheduled = await sql<{ id: string; participant_a_id: string; participant_b_id: string; tournament_id: string; round_number: number; decline_count: number }>(
    `SELECT b.id, b.participant_a_id, b.participant_b_id, b.tournament_id, b.round_number, b.decline_count
     FROM public.brackets b
     LEFT JOIN public.scheduled_matches sm ON sm.match_id = b.id
     WHERE b.status = 'pending'
       AND b.proposed_time_ts IS NULL
       AND b.dispute_flag = false
       AND sm.id IS NULL
       AND (SELECT COUNT(DISTINCT player_id) FROM public.match_availability WHERE match_id = b.id) >= 2`
  )

  for (const match of unscheduled) {
    try {
    const allWindows = await sql<{ player_id: string; date: string; start_time: string; end_time: string }>(
      `SELECT player_id, date, start_time, end_time FROM public.match_availability WHERE match_id = $1`,
      [match.id]
    )
    const playerIds = [...new Set(allWindows.map(w => w.player_id))]
    const windowsA = allWindows.filter(w => w.player_id === playerIds[0]).map(w => ({ date: w.date, start: toMinutes(w.start_time), end: toMinutes(w.end_time) }))
    const windowsB = allWindows.filter(w => w.player_id === playerIds[1]).map(w => ({ date: w.date, start: toMinutes(w.start_time), end: toMinutes(w.end_time) }))

    const participants = await sql<{ id: string; name: string; email: string; psn_id: string }>(
      `SELECT p.id, p.name, p.email, p.psn_id
       FROM public.brackets b
       JOIN public.participants p ON p.id = b.participant_a_id OR p.id = b.participant_b_id
       WHERE b.id = $1`,
      [match.id]
    )
    const playerA = participants.find(p => p.id === playerIds[0])!
    const playerB = participants.find(p => p.id === playerIds[1])!

    // Find overlap
    let overlap: { date: string; start: number; end: number } | null = null
    for (const a of windowsA) {
      for (const b of windowsB) {
        const o = findOverlap(a, b)
        if (o) { overlap = o; break }
      }
      if (overlap) break
    }

    if (overlap) {
      const roundData = await sql<{ round_name: string }>(
        `SELECT round_name FROM public.rounds WHERE tournament_id = $1 AND round_number = $2`,
        [match.tournament_id, match.round_number]
      )
      const roundName = roundData[0]?.round_name ?? null

      const STAGGER_ROUNDS = new Set(['Round of 16', 'Quarter-finals', 'Semi-finals'])
      let startMin = overlap.start
      if (roundName && STAGGER_ROUNDS.has(roundName)) {
        const siblings = await sql<{ scheduled_at: string }>(
          `SELECT scheduled_at FROM public.brackets
           WHERE tournament_id = $1 AND round_number = $2 AND id <> $3 AND scheduled_at IS NOT NULL`,
          [match.tournament_id, match.round_number, match.id]
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
        [match.id, scheduledAt]
      )
      await sql(
        `UPDATE public.brackets SET status = 'active', scheduled_at = $1, score_due_at = $1::timestamptz + interval '4 hours' WHERE id = $2`,
        [scheduledAt, match.id]
      )
      const tokenA = await createMatchToken(playerA.id, match.id, 'submission', 48)
      const tokenB = await createMatchToken(playerB.id, match.id, 'submission', 48)
      await Promise.all([
        sendScheduleConfirmationEmail(playerA.email, playerA.name.split(' ')[0], playerB.psn_id, scheduledAt, tokenA),
        sendScheduleConfirmationEmail(playerB.email, playerB.name.split(' ')[0], playerA.psn_id, scheduledAt, tokenB),
      ])
      results.availabilityReconciled++
      continue
    }

    // No overlap — suggestion logic
    const suggested = suggestTime(windowsA, windowsB)
    const suggestedAt = suggested
      ? new Date(`${suggested.date}T${minutesToTime(suggested.minutes)}:00+02:00`).toISOString()
      : null

    const roundRows = await sql<{ play_window_start: string; play_window_end: string }>(
      `SELECT play_window_start, play_window_end FROM public.rounds WHERE tournament_id = $1 AND round_number = $2`,
      [match.tournament_id, match.round_number]
    )
    const round = roundRows[0] ?? null

    const suggestionValid = suggested &&
      suggested.gapMinutes <= MAX_SUGGESTION_GAP_MINUTES &&
      (!round || (new Date(suggestedAt!) >= new Date(round.play_window_start) && new Date(suggestedAt!) <= new Date(round.play_window_end)))

    // After a prior decline, auto-schedule within the more-available player's window
    if (match.decline_count >= 1) {
      const totalMin = (id: string) => allWindows.filter(w => w.player_id === id).reduce((s, w) => s + toMinutes(w.end_time) - toMinutes(w.start_time), 0)
      const minA = totalMin(playerA.id)
      const minB = totalMin(playerB.id)
      const lessAvail = minA <= minB ? playerA : playerB
      const moreAvail = minA <= minB ? playerB : playerA
      // Schedule at the more-available player's slot closest to the less-available player's times
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
        [match.id, scheduledAt]
      )
      await sql(
        `UPDATE public.brackets SET status = 'active', scheduled_at = $1, score_due_at = $1::timestamptz + interval '4 hours' WHERE id = $2`,
        [scheduledAt, match.id]
      )
      const acceptToken  = await createMatchToken(lessAvail.id, match.id, 'forfeit_accept', 24)
      const declineToken = await createMatchToken(lessAvail.id, match.id, 'forfeit_decline', 24)
      await Promise.all([
        sendForfeitWarningEmail(lessAvail.email, lessAvail.name.split(' ')[0], moreAvail.psn_id, scheduledAt, acceptToken, declineToken),
        sendAdminFlagEmail(`Auto-scheduled after decline — match ${match.id}`, `${moreAvail.name} (${minA <= minB ? minB : minA} min) had more availability. Scheduled at ${scheduledAt}. ${lessAvail.name} asked to accept or forfeit.`),
      ])
      results.availabilityReconciled++
      continue
    }

    // Season 1 round 3+: skip the suggested-time step, go straight to resubmit.
    if (match.tournament_id === S1_ID && match.round_number >= 3) {
      await sql(`DELETE FROM public.match_availability WHERE match_id = $1`, [match.id])
      await sql(`UPDATE public.brackets SET proposed_time_ts = NULL, decline_count = GREATEST(decline_count, 1) WHERE id = $1`, [match.id])
      const tokenA = await createMatchToken(playerA.id, match.id, 'scheduling', 24)
      const tokenB = await createMatchToken(playerB.id, match.id, 'scheduling', 24)
      await Promise.all([
        sendResubmitAvailabilityEmail(playerA.email, playerA.name.split(' ')[0], tokenA),
        sendResubmitAvailabilityEmail(playerB.email, playerB.name.split(' ')[0], tokenB),
      ])
      results.availabilityReconciled++
      continue
    }

    if (!suggestionValid) {
      await sql(`DELETE FROM public.match_availability WHERE match_id = $1`, [match.id])
      await sql(`UPDATE public.brackets SET proposed_time_ts = NULL WHERE id = $1`, [match.id])
      const tokenA = await createMatchToken(playerA.id, match.id, 'scheduling', 24)
      const tokenB = await createMatchToken(playerB.id, match.id, 'scheduling', 24)
      await Promise.all([
        sendResubmitAvailabilityEmail(playerA.email, playerA.name.split(' ')[0], tokenA),
        sendResubmitAvailabilityEmail(playerB.email, playerB.name.split(' ')[0], tokenB),
      ])
      if (!suggested) {
        await sendAdminFlagEmail(
          `No same-day availability — match ${match.id}`,
          `${playerA.name} and ${playerB.name} submitted on different days. Resubmit emails sent.`
        )
      }
      results.availabilityReconciled++
      continue
    }

    const suggestedLabel = new Date(suggestedAt!).toLocaleString('en-ZA', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Africa/Johannesburg',
    })
    await sql(`UPDATE public.brackets SET proposed_time_ts = $1 WHERE id = $2`, [suggestedAt, match.id])
    const acceptA  = await createMatchToken(playerA.id, match.id, 'proposal_accept',  24)
    const declineA = await createMatchToken(playerA.id, match.id, 'proposal_decline', 24)
    const acceptB  = await createMatchToken(playerB.id, match.id, 'proposal_accept',  24)
    const declineB = await createMatchToken(playerB.id, match.id, 'proposal_decline', 24)
    await Promise.all([
      sendNoOverlapSuggestionEmail(playerA.email, playerA.name.split(' ')[0], suggestedLabel, acceptA, declineA),
      sendNoOverlapSuggestionEmail(playerB.email, playerB.name.split(' ')[0], suggestedLabel, acceptB, declineB),
    ])
    results.availabilityReconciled++
    } catch (e: any) {
      results.errors.push(`availability ${match.id}: ${e.message}`)
    }
  }
}

async function checkUpcomingMatchReminders(results: { reminders: number; errors: string[] }) {
  // 24h match-day notice + 2h reminder. 30-min windows so a 15-min cron always catches.
  const NOTICE_LOWER = '23 hours 45 minutes', NOTICE_UPPER = '24 hours 15 minutes'
  const TWO_LOWER = '1 hour 45 minutes', TWO_UPPER = '2 hours 15 minutes'
  const NOTICE_LO_MS = 23.75 * 3600000, NOTICE_HI_MS = 24.25 * 3600000
  const TWO_LO_MS = 1.75 * 3600000, TWO_HI_MS = 2.25 * 3600000

  const matches = await sql<{
    bracket_id: string
    scheduled_match_id: string
    scheduled_at: string
    reminder_24h_sent: boolean
    reminder_2h_sent: boolean
    participant_a_id: string
    participant_b_id: string
    invite_sender_id: string | null
  }>(
    `SELECT b.id AS bracket_id, sm.id AS scheduled_match_id, sm.scheduled_at,
            sm.reminder_24h_sent, sm.reminder_2h_sent, sm.invite_sender_id,
            b.participant_a_id, b.participant_b_id
     FROM public.brackets b
     JOIN public.scheduled_matches sm ON sm.match_id = b.id
     WHERE b.status = 'active'
       AND b.winner_id IS NULL
       AND b.dispute_flag = false
       AND (
         (sm.reminder_24h_sent = false AND sm.scheduled_at BETWEEN now() + interval '${NOTICE_LOWER}' AND now() + interval '${NOTICE_UPPER}')
         OR
         (sm.reminder_2h_sent = false AND sm.scheduled_at BETWEEN now() + interval '${TWO_LOWER}' AND now() + interval '${TWO_UPPER}')
       )`
  )

  const fmtDay = (d: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)

  for (const match of matches) {
    try {
    const players = await sql<{ id: string; name: string; email: string; psn_id: string }>(
      `SELECT id, name, email, psn_id FROM public.participants WHERE id IN ($1, $2)`,
      [match.participant_a_id, match.participant_b_id]
    )
    const pA = players.find(p => p.id === match.participant_a_id)!
    const pB = players.find(p => p.id === match.participant_b_id)!

    const matchTime = new Date(match.scheduled_at).toLocaleString('en-ZA', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Africa/Johannesburg',
    })
    const sameDay = fmtDay(new Date(match.scheduled_at)) === fmtDay(new Date())

    const send24h = !match.reminder_24h_sent &&
      new Date(match.scheduled_at) >= new Date(Date.now() + NOTICE_LO_MS) &&
      new Date(match.scheduled_at) <= new Date(Date.now() + NOTICE_HI_MS)

    const send2h = !match.reminder_2h_sent &&
      new Date(match.scheduled_at) >= new Date(Date.now() + TWO_LO_MS) &&
      new Date(match.scheduled_at) <= new Date(Date.now() + TWO_HI_MS)

    if (send24h) {
      await Promise.all([
        sendMatchDayNoticeEmail(pA.email, pA.name.split(' ')[0], pB.psn_id, matchTime, sameDay),
        sendMatchDayNoticeEmail(pB.email, pB.name.split(' ')[0], pA.psn_id, matchTime, sameDay),
      ])
      await sql(`UPDATE public.scheduled_matches SET reminder_24h_sent = true WHERE id = $1`, [match.scheduled_match_id])
      results.reminders++
    }

    if (send2h) {
      await Promise.all([
        sendMatchReminder2h(pA.email, pA.name.split(' ')[0], pB.psn_id),
        sendMatchReminder2h(pB.email, pB.name.split(' ')[0], pA.psn_id),
      ])
      await sql(`UPDATE public.scheduled_matches SET reminder_2h_sent = true WHERE id = $1`, [match.scheduled_match_id])

      // Assign invite sender if not already set, then send role emails
      let senderParticipantId = match.invite_sender_id
      if (!senderParticipantId) {
        senderParticipantId = Math.random() < 0.5 ? pA.id : pB.id
        await sql(
          `UPDATE public.scheduled_matches SET invite_sender_id = $1 WHERE id = $2`,
          [senderParticipantId, match.scheduled_match_id]
        )
      }
      const sender = senderParticipantId === pA.id ? pA : pB
      const receiver = senderParticipantId === pA.id ? pB : pA
      await Promise.all([
        sendInviteSenderEmail(sender.email, sender.name.split(' ')[0], receiver.psn_id, matchTime),
        sendInviteReceiverEmail(receiver.email, receiver.name.split(' ')[0], sender.psn_id, matchTime),
      ])

      results.reminders++
    }
    } catch (e: any) {
      results.errors.push(`reminders ${match.bracket_id}: ${e.message}`)
    }
  }
}

async function checkScoreWindowOpen(results: { scoreWindowOpened: number; errors: string[] }) {
  // Fires once after kickoff: "submit your score — 4 hours remaining"
  const matches = await sql<{
    bracket_id: string
    sm_id: string
    participant_a_id: string
    participant_b_id: string
  }>(
    `SELECT b.id AS bracket_id, sm.id AS sm_id, b.participant_a_id, b.participant_b_id
     FROM public.brackets b
     JOIN public.scheduled_matches sm ON sm.match_id = b.id
     WHERE b.status = 'active'
       AND b.winner_id IS NULL
       AND b.dispute_flag = false
       AND sm.scheduled_at < now()
       AND sm.score_window_open_sent = false`
  )

  for (const match of matches) {
    try {
    const players = await sql<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM public.participants WHERE id IN ($1, $2)`,
      [match.participant_a_id, match.participant_b_id]
    )
    const pA = players.find(p => p.id === match.participant_a_id)!
    const pB = players.find(p => p.id === match.participant_b_id)!

    const [tokenA, tokenB] = await Promise.all([
      createMatchToken(pA.id, match.bracket_id, 'submission', 48),
      createMatchToken(pB.id, match.bracket_id, 'submission', 48),
    ])

    await Promise.all([
      sendScoreWindowOpenEmail(pA.email, pA.name.split(' ')[0], tokenA),
      sendScoreWindowOpenEmail(pB.email, pB.name.split(' ')[0], tokenB),
    ])

    await sql(`UPDATE public.scheduled_matches SET score_window_open_sent = true, score_window_open_sent_at = now() WHERE id = $1`, [match.sm_id])
    results.scoreWindowOpened++
    } catch (e: any) {
      results.errors.push(`scoreWindow ${match.bracket_id}: ${e.message}`)
    }
  }
}

async function checkScoreReminders(results: { reminders: number; errors: string[] }) {
  // Fire 2h after score window opens if no score_reports exist
  const matches = await sql<{
    bracket_id: string
    sm_id: string
    participant_a_id: string
    participant_b_id: string
  }>(
    `SELECT b.id AS bracket_id, sm.id AS sm_id, b.participant_a_id, b.participant_b_id
     FROM public.brackets b
     JOIN public.scheduled_matches sm ON sm.match_id = b.id
     WHERE b.status = 'active'
       AND b.winner_id IS NULL
       AND b.dispute_flag = false
       AND sm.score_window_open_sent_at IS NOT NULL
       AND sm.score_reminder_2h_sent = false
       AND now() >= sm.score_window_open_sent_at + interval '2 hours'
       AND NOT EXISTS (SELECT 1 FROM public.score_reports WHERE bracket_id = b.id)`
  )

  for (const match of matches) {
    try {
      const players = await sql<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM public.participants WHERE id IN ($1, $2)`,
        [match.participant_a_id, match.participant_b_id]
      )
      const pA = players.find(p => p.id === match.participant_a_id)!
      const pB = players.find(p => p.id === match.participant_b_id)!

      const [tokenA, tokenB] = await Promise.all([
        createMatchToken(pA.id, match.bracket_id, 'submission', 48),
        createMatchToken(pB.id, match.bracket_id, 'submission', 48),
      ])

      await Promise.all([
        sendScoreReminderEmail(pA.email, pA.name.split(' ')[0], `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://couchcup.co.za'}/match/${tokenA}`),
        sendScoreReminderEmail(pB.email, pB.name.split(' ')[0], `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://couchcup.co.za'}/match/${tokenB}`),
      ])

      await sql(`UPDATE public.scheduled_matches SET score_reminder_2h_sent = true WHERE id = $1`, [match.sm_id])
      results.reminders++
    } catch (e: any) {
      results.errors.push(`scoreReminder ${match.bracket_id}: ${e.message}`)
    }
  }
}

async function checkExpiredSchedulingWindows(results: { schedulingFlagged: number; schedulingAutoAdvanced: number; errors: string[] }) {
  // Matches where a scheduling token expired but match not yet scheduled
  const expired = await sql<{ id: string; participant_a_id: string; participant_b_id: string; tournament_id: string; round_number: number }>(
    `SELECT DISTINCT b.id, b.participant_a_id, b.participant_b_id, b.tournament_id, b.round_number
     FROM public.brackets b
     JOIN public.match_tokens mt ON mt.match_id = b.id AND mt.type = 'scheduling'
     LEFT JOIN public.scheduled_matches sm ON sm.match_id = b.id
     WHERE b.status = 'pending'
       AND mt.expires_at < now()
       AND mt.used_at IS NULL
       AND sm.id IS NULL
       AND b.dispute_flag = false`
  )

  for (const match of expired) {
    try {
    const submitted = await sql<{ player_id: string }>(
      `SELECT player_id FROM public.match_availability WHERE match_id = $1`,
      [match.id]
    )
    const submittedIds = new Set(submitted.map(r => r.player_id))
    const ids = [match.participant_a_id, match.participant_b_id]
    const missing = ids.filter(id => !submittedIds.has(id))

    if (!missing.length) continue // both submitted but no overlap — handled elsewhere

    const people = await sql<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM public.participants WHERE id IN ($1, $2)`,
      [match.participant_a_id, match.participant_b_id]
    )

    // Exactly one player submitted → they win by default and advance automatically.
    if (missing.length === 1) {
      const winnerId = ids.find(id => submittedIds.has(id))!
      const loser = people.find(p => p.id === missing[0])!
      const winner = people.find(p => p.id === winnerId)!

      await sql(
        `UPDATE public.brackets
         SET winner_id = $1, status = 'completed', completed_at = now(),
             forfeit_reason = 'Opponent did not submit availability by the scheduling deadline'
         WHERE id = $2`,
        [winnerId, match.id]
      )

      // Hold result emails for release script
      // sendRoundEmails() will be called when result_alert_sent is set to true

      await checkRoundCompletion(match.tournament_id, match.round_number)

      results.schedulingAutoAdvanced++
      continue
    }

    // Neither player submitted → try best-loser promotion
    const byeRecipient = await sql<{ id: string; name: string; email: string }>(
      `SELECT rl.id, rl.name, p.email FROM public.round_losers rl
       JOIN public.participants p ON p.id = rl.id
       WHERE rl.tournament_id = $1 AND rl.round_number = $2
         AND rl.id NOT IN ($3, $4)
         AND rl.id NOT IN (
           SELECT winner_id FROM public.brackets
           WHERE tournament_id = $1 AND round_number = $5 AND winner_id IS NOT NULL
           UNION
           SELECT bye_recipient_id FROM public.brackets
           WHERE tournament_id = $1 AND round_number = $5 AND bye_recipient_id IS NOT NULL
         )
       ORDER BY rl.loss_margin ASC, rl.total_goals DESC
       LIMIT 1`,
      [match.tournament_id, match.round_number - 1, match.participant_a_id, match.participant_b_id, match.round_number]
    )

    if (byeRecipient.length) {
      const bye = byeRecipient[0]

      await sql(
        `UPDATE public.brackets SET winner_id = $1, bye_recipient_id = $1, status = 'completed', completed_at = now(), forfeit_reason = 'Both players forfeited scheduling — best loser from previous round promoted' WHERE id = $2`,
        [bye.id, match.id]
      )

      await sql(
        `UPDATE public.participants SET status = 'eliminated' WHERE id IN ($1, $2)`,
        [match.participant_a_id, match.participant_b_id]
      )

      await sql(
        `UPDATE public.participants SET status = 'bracket' WHERE id = $1`,
        [bye.id]
      )

      // Hold promotion and result emails for release script
      // sendPromotionEmail() will be called from the release script

      await checkRoundCompletion(match.tournament_id, match.round_number)

      results.schedulingAutoAdvanced++
    } else {
      // No eligible loser, flag for admin
      await sql(
        `UPDATE public.brackets SET dispute_flag = true, notes = 'Scheduling window expired — neither player submitted availability' WHERE id = $1`,
        [match.id]
      )

      await sendAdminFlagEmail(
        `Scheduling window expired — match ${match.id}`,
        `Neither player submitted availability for the match between ${people.map(n => n.name).join(' and ')}.\nPlayer IDs: ${missing.join(', ')}`
      )

      results.schedulingFlagged++
    }
    } catch (e: any) {
      results.errors.push(`scheduling ${match.id}: ${e.message}`)
    }
  }
}

async function checkExpiredScoreWindows(results: { scoreResolved: number; errors: string[] }) {
  // Matches where score_due_at has passed and status is still active
  const expired = await sql<{
    id: string
    participant_a_id: string
    participant_b_id: string
    score_due_at: string
    tournament_id: string
    round_number: number
  }>(
    `SELECT id, participant_a_id, participant_b_id, score_due_at, tournament_id, round_number
     FROM public.brackets
     WHERE status = 'active'
       AND score_due_at IS NOT NULL
       AND score_due_at < now()
       AND winner_id IS NULL
       AND dispute_flag = false`
  )

  for (const match of expired) {
    try {
    const reports = await sql<{ reporter_id: string; claimed_winner: string | null; score_reporter: number; score_opponent: number }>(
      `SELECT reporter_id, claimed_winner, score_reporter, score_opponent
       FROM public.score_reports WHERE bracket_id = $1`,
      [match.id]
    )

    const players = await sql<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM public.participants WHERE id IN ($1, $2)`,
      [match.participant_a_id, match.participant_b_id]
    )

    if (reports.length === 1) {
      // Single submission — if it's a draw report, trigger rematch; else accept as final
      const report = reports[0]
      if (report.claimed_winner === null) {
        // One player reported a draw but the other never submitted: flag admin, trigger rematch
        await triggerRematch(match.id)
        const pA = players.find(p => p.id === match.participant_a_id)!
        const pB = players.find(p => p.id === match.participant_b_id)!
        await sendAdminFlagEmail(
          `Draw reported, opponent didn't submit, match ${match.id}`,
          `${pA.name} reported a draw but ${pB.name} did not submit within 4h. Rematch emails sent.`
        )
        results.scoreResolved++
        continue
      }
      const winner = players.find(p => p.id === report.claimed_winner)!
      const loser = players.find(p => p.id !== report.claimed_winner)!

      // Normalise the lone reporter's goals to participant_a / participant_b ordering
      const isReporterA = report.reporter_id === match.participant_a_id
      const score_a = isReporterA ? report.score_reporter : report.score_opponent
      const score_b = isReporterA ? report.score_opponent : report.score_reporter

      await sql(
        `UPDATE public.brackets
         SET winner_id = $1, status = 'completed', completed_at = now(),
             score_a = $2, score_b = $3, reported_by_a = $4, reported_by_b = $5
         WHERE id = $6`,
        [winner.id, score_a, score_b, isReporterA, !isReporterA, match.id]
      )

      await sql(
        `UPDATE public.participants SET status = 'eliminated' WHERE id = $1`,
        [loser.id]
      )

      // Hold result emails for release script
      // sendRoundEmails() will be called when result_alert_sent is set to true

      await sendAdminFlagEmail(
        `Single submission accepted — match ${match.id}`,
        `${winner.name} submitted a score. ${loser.name} did not respond within the 4hr window. ${winner.name} advances.`
      )

      results.scoreResolved++
      await checkRoundCompletion(match.tournament_id, match.round_number)
    } else if (reports.length === 0) {
      // Neither submitted — best performing loser from round takes the slot.
      // Order by loss margin (closest match), then by goals scored, and exclude anyone already advanced this round
      // (a winner, or a loser already handed a bye in another match).
      const byeRecipient = await sql<{ id: string; name: string; email: string }>(
        `SELECT rl.id, rl.name, p.email FROM public.round_losers rl
         JOIN public.participants p ON p.id = rl.id
         WHERE rl.tournament_id = $1 AND rl.round_number = $2
           AND rl.id NOT IN ($3, $4)
           AND rl.id NOT IN (
             SELECT winner_id FROM public.brackets
             WHERE tournament_id = $1 AND round_number = $2 AND winner_id IS NOT NULL
             UNION
             SELECT bye_recipient_id FROM public.brackets
             WHERE tournament_id = $1 AND round_number = $2 AND bye_recipient_id IS NOT NULL
           )
         ORDER BY rl.loss_margin ASC, rl.total_goals DESC
         LIMIT 1`,
        [match.tournament_id, match.round_number, match.participant_a_id, match.participant_b_id]
      )

      const pA = players.find(p => p.id === match.participant_a_id)!
      const pB = players.find(p => p.id === match.participant_b_id)!

      if (byeRecipient.length) {
        const bye = byeRecipient[0]

        await sql(
          `UPDATE public.brackets
           SET winner_id = $1, bye_recipient_id = $1, status = 'completed', completed_at = now(),
               forfeit_reason = 'Neither player submitted score — best round loser advances'
           WHERE id = $2`,
          [bye.id, match.id]
        )

        await sql(
          `UPDATE public.participants SET status = 'eliminated' WHERE id IN ($1, $2)`,
          [match.participant_a_id, match.participant_b_id]
        )

        await sql(
          `UPDATE public.participants SET status = 'bracket' WHERE id = $1`,
          [bye.id]
        )

        // Hold promotion email for release script
        // sendPromotionEmail() will be called from the release script

        await sendAdminFlagEmail(
          `No score submitted — bye advanced — match ${match.id}`,
          `Neither ${pA.name} nor ${pB.name} submitted a score within the window. ${bye.name} has been advanced as the best-performing loser from round ${match.round_number}.`
        )

        results.scoreResolved++
        await checkRoundCompletion(match.tournament_id, match.round_number)
      } else {
        // No eligible loser — flag admin
        await sql(
          `UPDATE public.brackets SET dispute_flag = true, notes = 'Neither submitted score and no eligible loser for bye' WHERE id = $1`,
          [match.id]
        )

        await sendAdminFlagEmail(
          `No score submitted, no bye available — match ${match.id}`,
          `Neither ${pA.name} nor ${pB.name} submitted a score, and no eligible loser was found for this round. Manual resolution required.`
        )
      }
    } else {
      // Both players submitted but the match never resolved.
      const [rA, rB] = reports
      const pA = players.find(p => p.id === match.participant_a_id)!
      const pB = players.find(p => p.id === match.participant_b_id)!

      // Both reported a draw — trigger rematch (cron caught it before score route did)
      if (rA.claimed_winner === null && rB.claimed_winner === null) {
        await triggerRematch(match.id)
        results.scoreResolved++
        continue
      }

      // One draw / one winner or conflicting winners — flag for review
      await sql(
        `UPDATE public.brackets SET dispute_flag = true, dispute_status = 'pending_review', notes = 'Both players submitted but match not resolved before window closed' WHERE id = $1`,
        [match.id]
      )
      await sendAdminFlagEmail(
        `Unresolved despite both submissions — match ${match.id}`,
        `${pA.name} and ${pB.name} both submitted scores but the match was not resolved before the window closed. Manual review required — do not eliminate either player.`
      )
    }
    } catch (e: any) {
      results.errors.push(`scoring ${match.id}: ${e.message}`)
    }
  }
}

async function checkExpiredProposals(results: { proposalsAutoConfirmed: number; errors: string[] }) {
  // Brackets with a proposed time where all proposal_accept tokens have expired (24hr passed) and no decline happened
  const expired = await sql<{ id: string; proposed_time_ts: string; participant_a_id: string; participant_b_id: string }>(
    `SELECT b.id, b.proposed_time_ts, b.participant_a_id, b.participant_b_id
     FROM public.brackets b
     LEFT JOIN public.scheduled_matches sm ON sm.match_id = b.id
     WHERE b.status = 'pending'
       AND b.proposed_time_ts IS NOT NULL
       AND sm.id IS NULL
       AND b.dispute_flag = false
       AND NOT EXISTS (
         SELECT 1 FROM public.match_tokens
         WHERE match_id = b.id AND type = 'proposal_decline' AND used_at IS NOT NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.match_tokens
         WHERE match_id = b.id AND type = 'proposal_accept' AND expires_at > now()
       )
       AND EXISTS (
         SELECT 1 FROM public.match_tokens
         WHERE match_id = b.id AND type = 'proposal_accept'
       )`
  )

  for (const match of expired) {
    try {
    const scheduledAt = match.proposed_time_ts

    await sql(
      `INSERT INTO public.scheduled_matches (match_id, scheduled_at)
       VALUES ($1, $2)
       ON CONFLICT (match_id) DO UPDATE SET scheduled_at = $2, confirmed_at = now()`,
      [match.id, scheduledAt]
    )
    await sql(
      `UPDATE public.brackets SET status = 'active', scheduled_at = $1, proposed_time_ts = NULL,
       score_due_at = $1::timestamptz + interval '4 hours' WHERE id = $2`,
      [scheduledAt, match.id]
    )

    const players = await sql<{ id: string; name: string; email: string; psn_id: string }>(
      `SELECT id, name, email, psn_id FROM public.participants WHERE id IN ($1, $2)`,
      [match.participant_a_id, match.participant_b_id]
    )
    const pA = players.find(p => p.id === match.participant_a_id)!
    const pB = players.find(p => p.id === match.participant_b_id)!

    const { createMatchToken } = await import('@/lib/tokens')
    const tokenA = await createMatchToken(pA.id, match.id, 'submission', 48)
    const tokenB = await createMatchToken(pB.id, match.id, 'submission', 48)

    await Promise.all([
      sendScheduleConfirmationEmail(pA.email, pA.name.split(' ')[0], pB.psn_id, scheduledAt, tokenA),
      sendScheduleConfirmationEmail(pB.email, pB.name.split(' ')[0], pA.psn_id, scheduledAt, tokenB),
    ])

    results.proposalsAutoConfirmed++
    } catch (e: any) {
      results.errors.push(`proposals ${match.id}: ${e.message}`)
    }
  }
}

async function checkExpiredSelections(results: { selectionsReclaimed: number; errors: string[] }) {
  // Selected players who never accepted within the 24h window (acceptance token expired, unused).
  const ghosted = await sql<{
    entry_id: string
    player_id: string
    tournament_id: string
    name: string
    email: string
  }>(
    `SELECT we.id AS entry_id, we.player_id, we.tournament_id, p.name, p.email
     FROM public.waitlist_entries we
     JOIN public.players p ON p.id = we.player_id
     WHERE we.status = 'selected'
       AND we.accepted_at IS NULL
       AND EXISTS (
         SELECT 1 FROM public.player_tokens pt
         WHERE pt.player_id = we.player_id AND pt.tournament_id = we.tournament_id AND pt.type = 'acceptance'
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.player_tokens pt
         WHERE pt.player_id = we.player_id AND pt.tournament_id = we.tournament_id AND pt.type = 'acceptance'
           AND pt.used_at IS NULL AND pt.expires_at > now()
       )`
  )

  for (const g of ghosted) {
    try {
    // Expire the ghosted selection + invalidate any leftover acceptance tokens
    await sql(`UPDATE public.waitlist_entries SET status = 'expired' WHERE id = $1`, [g.entry_id])
    await sql(
      `UPDATE public.player_tokens SET used_at = now()
       WHERE player_id = $1 AND tournament_id = $2 AND type = 'acceptance' AND used_at IS NULL`,
      [g.player_id, g.tournament_id]
    )

    // Promote the next reserve (earliest signup still on the waitlist)
    const next = await sql<{ id: string; player_id: string; name: string; email: string }>(
      `SELECT we.id, we.player_id, p.name, p.email
       FROM public.waitlist_entries we
       JOIN public.players p ON p.id = we.player_id
       WHERE we.tournament_id = $1 AND we.status = 'waitlist'
       ORDER BY we.signup_timestamp ASC
       LIMIT 1`,
      [g.tournament_id]
    )

    if (!next.length) {
      await sendAdminFlagEmail(
        `Spot reclaimed, no reserve available — ${g.tournament_id}`,
        `${g.name} did not accept within 24h. Their spot was reclaimed but no waitlist player remains to promote. Manual action needed.`
      )
      continue
    }

    const promoted = next[0]
    await sql(`UPDATE public.waitlist_entries SET status = 'selected', selected_at = now() WHERE id = $1`, [promoted.id])
    const token = await createPlayerToken(promoted.player_id, g.tournament_id, 'acceptance', 24)
    await sendSelectionEmail(promoted.email, promoted.name.split(' ')[0], token)
    // YouTube setup email is sent on acceptance (respond route), not at invite time.

    await sendAdminFlagEmail(
      `Reserve promoted — ${g.tournament_id}`,
      `${g.name} did not accept within 24h. ${promoted.name} promoted from the waitlist and sent a selection email (24h to accept).`
    )

    results.selectionsReclaimed++
    } catch (e: any) {
      results.errors.push(`selections ${g.entry_id}: ${e.message}`)
    }
  }
}

