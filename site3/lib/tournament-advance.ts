import { sql } from './supabase'
import { createMatchToken } from './tokens'
import {
  sendOpponentEmail,
  sendSchedulingEmail,
  sendScheduleConfirmationEmail,
  sendInTheFinalEmail,
  sendEliminatedEmail,
  sendAdvancedEmail,
  sendRunnerUpEmail,
  sendChampionEmail,
  sendRematchEmail,
  sendAdminFlagEmail,
} from './email'

export async function triggerRematch(bracketId: string) {
  // Clear previous score reports, keep bracket active, refresh score window + submission tokens
  await sql(`DELETE FROM public.score_reports WHERE bracket_id = $1`, [bracketId])
  await sql(
    `UPDATE public.brackets SET score_due_at = now() + interval '4 hours' WHERE id = $1`,
    [bracketId]
  )

  const bracketRows = await sql<{ participant_a_id: string; participant_b_id: string; tournament_id: string; round_number: number }>(
    `SELECT participant_a_id, participant_b_id, tournament_id, round_number FROM public.brackets WHERE id = $1`,
    [bracketId]
  )
  if (!bracketRows.length) return
  const b = bracketRows[0]

  const players = await sql<{ id: string; name: string; email: string; psn_id: string }>(
    `SELECT id, name, email, psn_id FROM public.participants WHERE id IN ($1, $2)`,
    [b.participant_a_id, b.participant_b_id]
  )
  const pA = players.find(p => p.id === b.participant_a_id)!
  const pB = players.find(p => p.id === b.participant_b_id)!

  const tokenA = await createMatchToken(pA.id, bracketId, 'submission', 48)
  const tokenB = await createMatchToken(pB.id, bracketId, 'submission', 48)

  await Promise.all([
    sendRematchEmail(pA.email, pA.name.split(' ')[0], pB.psn_id, tokenA),
    sendRematchEmail(pB.email, pB.name.split(' ')[0], pA.psn_id, tokenB),
  ])

  // Track consecutive draws. After 3, flag admin.
  const updatedRows = await sql<{ draw_count: number }>(
    `UPDATE public.brackets SET draw_count = COALESCE(draw_count, 0) + 1 WHERE id = $1 RETURNING draw_count`,
    [bracketId]
  )
  const draws = updatedRows[0]?.draw_count ?? 1

  if (draws >= 3) {
    await sendAdminFlagEmail(
      `3 consecutive draws, match ${bracketId}`,
      `${pA.name} vs ${pB.name} has drawn ${draws} times. Rematch emails sent. Manual review may be warranted.`
    )
  }
}

export async function sendRoundEmails(
  winner: { name: string; email: string },
  loser: { name: string; email: string },
  tournamentId: string,
  roundNumber: number
) {
  const roundRows = await sql<{ round_name: string }>(
    `SELECT round_name FROM public.rounds WHERE tournament_id = $1 AND round_number = $2`,
    [tournamentId, roundNumber]
  )
  const roundName = roundRows[0]?.round_name ?? ''

  if (roundName === 'Final') {
    await Promise.all([
      sendChampionEmail(winner.email, winner.name.split(' ')[0]),
      sendRunnerUpEmail(loser.email, loser.name.split(' ')[0]),
    ])
  } else if (roundName === 'Semi-finals') {
    const finalRows = await sql<{ play_window_start: string }>(
      `SELECT play_window_start FROM public.rounds WHERE tournament_id = $1 AND round_name = 'Final' LIMIT 1`,
      [tournamentId]
    )
    const finalDate = finalRows[0]
      ? new Date(finalRows[0].play_window_start).toLocaleString('en-ZA', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          hour12: false, timeZone: 'Africa/Johannesburg',
        })
      : 'Friday 3 July at 19:00'
    await Promise.all([
      sendInTheFinalEmail(winner.email, winner.name.split(' ')[0], finalDate),
      sendEliminatedEmail(loser.email, loser.name.split(' ')[0]),
    ])
  } else {
    await Promise.all([
      sendAdvancedEmail(winner.email, winner.name.split(' ')[0]),
      sendEliminatedEmail(loser.email, loser.name.split(' ')[0]),
    ])
  }
}

export async function checkRoundCompletion(tournamentId: string, roundNumber: number) {
  const pending = await sql<{ count: string }>(
    `SELECT COUNT(*) AS count FROM public.brackets
     WHERE tournament_id = $1 AND round_number = $2 AND status != 'completed'`,
    [tournamentId, roundNumber]
  )
  if (parseInt(pending[0].count) > 0) return

  // Guard against duplicate next-round generation
  const nextExists = await sql<{ id: string }>(
    `SELECT id FROM public.brackets WHERE tournament_id = $1 AND round_number = $2 LIMIT 1`,
    [tournamentId, roundNumber + 1]
  )
  if (nextExists.length) return

  await generateNextRound(tournamentId, roundNumber)
}

export async function generateNextRound(tournamentId: string, completedRound: number) {
  const winners = await sql<{ winner_id: string; position: number }>(
    `SELECT winner_id, position FROM public.brackets
     WHERE tournament_id = $1 AND round_number = $2
     ORDER BY position ASC`,
    [tournamentId, completedRound]
  )

  if (winners.length < 2) {
    if (winners.length === 1) {
      const champ = await sql<{ name: string }>(
        `SELECT name FROM public.participants WHERE id = $1`,
        [winners[0].winner_id]
      )
      await sql(`UPDATE public.participants SET status = 'winner' WHERE id = $1`, [winners[0].winner_id])
    }
    return
  }

  const nextRound = completedRound + 1

  // Round windows are derived dynamically: each round opens the moment the
  // previous round completes; players submit availability within 24h, and the
  // play window only opens once that scheduling window closes (so no match can
  // be played during scheduling). Play-window length is per-tournament via
  // tournaments.play_window_hours (Season 1 = 72h, default 48h). The Final is a
  // fixed kickoff 3 days out (no availability step).
  const advancing = winners.length
  const isFinalRound = advancing === 2
  const dynamicRoundName =
    advancing === 2 ? 'Final' :
    advancing <= 4 ? 'Semi-finals' :
    advancing <= 8 ? 'Quarter-finals' :
    advancing <= 16 ? 'Round of 16' :
    `Round ${nextRound}`
  const pwRows = await sql<{ play_window_hours: number }>(
    `SELECT play_window_hours FROM public.tournaments WHERE id = $1`,
    [tournamentId]
  )
  const pwHours = pwRows[0]?.play_window_hours ?? 48

  await sql(`DELETE FROM public.rounds WHERE tournament_id = $1 AND round_number = $2`, [tournamentId, nextRound])
  // Defer scheduling_deadline, play_window_start, play_window_end to release script
  // Dates are left NULL and will be set when result_alert_sent / opponent_email_sent are triggered
  await sql(
    `INSERT INTO public.rounds (tournament_id, round_number, round_name, scheduling_deadline, play_window_start, play_window_end)
     VALUES ($1, $2, $3, NULL, NULL, NULL)`,
    [tournamentId, nextRound, dynamicRoundName]
  )

  const byePlayerIds: string[] = []

  for (let i = 0; i < winners.length; i += 2) {
    const aId = winners[i].winner_id
    const pos = Math.floor(i / 2) + 1
    const hasPair = i + 1 < winners.length

    if (!hasPair) {
      // Odd number of players — last player gets an automatic bye and advances
      await sql(
        `INSERT INTO public.brackets (tournament_id, round_number, position, participant_a_id, participant_b_id, winner_id, status, completed_at, forfeit_reason)
         VALUES ($1, $2, $3, $4, NULL, $4, 'completed', now(), 'Bye — odd number of players, auto-advanced')`,
        [tournamentId, nextRound, pos, aId]
      )
      byePlayerIds.push(aId)
      continue
    }

    const bId = winners[i + 1].winner_id
    await sql(
      `INSERT INTO public.brackets (tournament_id, round_number, position, participant_a_id, participant_b_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [tournamentId, nextRound, pos, aId, bId]
    )
  }

  // Notify any auto-bye players that they advanced without playing
  for (const byeId of byePlayerIds) {
    const p = await sql<{ name: string; email: string }>(
      `SELECT name, email FROM public.participants WHERE id = $1`,
      [byeId]
    )
    if (p.length) await sendAdvancedEmail(p[0].email, p[0].name.split(' ')[0])
  }

  const roundData = await sql<{ round_name: string; play_window_start: string; play_window_end: string; scheduling_deadline: string }>(
    `SELECT round_name, play_window_start, play_window_end, scheduling_deadline
     FROM public.rounds WHERE tournament_id = $1 AND round_number = $2`,
    [tournamentId, nextRound]
  )

  const newBrackets = await sql<{ id: string; participant_a_id: string; participant_b_id: string }>(
    `SELECT id, participant_a_id, participant_b_id FROM public.brackets
     WHERE tournament_id = $1 AND round_number = $2`,
    [tournamentId, nextRound]
  )

  for (const bracket of newBrackets) {
    if (bracket.participant_a_id === bracket.participant_b_id) continue

    const players = await sql<{ id: string; name: string; email: string; psn_id: string; youtube_url: string | null }>(
      `SELECT pa.id, pa.name, pa.email, pa.psn_id,
              (SELECT pl.youtube_url FROM public.players pl WHERE lower(pl.email) = lower(pa.email) LIMIT 1) AS youtube_url
       FROM public.participants pa WHERE pa.id IN ($1, $2)`,
      [bracket.participant_a_id, bracket.participant_b_id]
    )
    const pA = players.find(p => p.id === bracket.participant_a_id)!
    const pB = players.find(p => p.id === bracket.participant_b_id)!

    if (roundData.length && roundData[0].round_name === 'Final') {
      // Final is held — release script sets the date, creates the submission tokens,
      // and sends the match confirmation when opponent_email_sent is triggered.
    } else if (roundData.length) {
      // Hold opponent email and scheduling token generation for release script
      // Tokens and emails will be created when opponent_email_sent is triggered
    } else {
      const tokenA = await createMatchToken(pA.id, bracket.id, 'scheduling', 24)
      const tokenB = await createMatchToken(pB.id, bracket.id, 'scheduling', 24)
      await Promise.all([
        sendSchedulingEmail(pA.email, pA.name.split(' ')[0], pB.psn_id, tokenA),
        sendSchedulingEmail(pB.email, pB.name.split(' ')[0], pA.psn_id, tokenB),
      ])
    }
  }
}
