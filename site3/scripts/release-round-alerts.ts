/**
 * release-round-alerts.ts — release result & opponent emails for a tournament
 * Usage: cd site3 && npx tsx scripts/release-round-alerts.ts <tournamentId>
 *
 * Idempotent:
 * 1. Sends result emails (advanced/eliminated/in-final/champion/runner-up) for completed matches with result_alert_sent=false
 * 2. Sets scheduling_deadline, play_window_start, play_window_end on the newest generated round
 * 3. Sends opponent emails to both players in the newest round's matches with opponent_email_sent=false
 * 4. Sets result_alert_sent=true and opponent_email_sent=true to mark as released
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

import type { NextRequest } from 'next/server'

;(async () => {
  const tournamentId = process.argv[2]
  if (!tournamentId) {
    console.error('Usage: npx tsx scripts/release-round-alerts.ts <tournamentId>')
    process.exit(1)
  }

  const { sql } = await import('../lib/supabase.ts')
  const {
    createMatchToken,
  } = await import('../lib/tokens.ts')
  const {
    sendAdvancedEmail,
    sendEliminatedEmail,
    sendInTheFinalEmail,
    sendChampionEmail,
    sendRunnerUpEmail,
    sendOpponentEmail,
    sendScheduleConfirmationEmail,
  } = await import('../lib/email.ts')

  try {
    console.log(`Releasing round alerts for tournament ${tournamentId}...`)

    // STEP 1: Send result emails for completed matches with result_alert_sent=false
    const completedMatches = await sql<{
      bracket_id: string
      winner_id: string
      participant_a_id: string
      participant_b_id: string
      tournament_id: string
      round_number: number
    }>(
      `SELECT b.id AS bracket_id, b.winner_id, b.participant_a_id, b.participant_b_id, b.tournament_id, b.round_number
       FROM public.brackets b
       WHERE b.tournament_id = $1
         AND b.status = 'completed'
         AND b.winner_id IS NOT NULL
         AND b.result_alert_sent = false`,
      [tournamentId]
    )

    for (const match of completedMatches) {
      const winner = await sql<{ name: string; email: string }>(
        `SELECT name, email FROM public.participants WHERE id = $1`,
        [match.winner_id]
      )
      const loser = await sql<{ name: string; email: string }>(
        `SELECT name, email FROM public.participants WHERE id = $1`,
        [match.winner_id === match.participant_a_id ? match.participant_b_id : match.participant_a_id]
      )

      if (winner.length && loser.length) {
        const w = winner[0]
        const l = loser[0]

        const roundData = await sql<{ round_name: string }>(
          `SELECT round_name FROM public.rounds WHERE tournament_id = $1 AND round_number = $2`,
          [match.tournament_id, match.round_number]
        )
        const roundName = roundData[0]?.round_name ?? ''

        if (roundName === 'Final') {
          await Promise.all([
            sendChampionEmail(w.email, w.name.split(' ')[0]),
            sendRunnerUpEmail(l.email, l.name.split(' ')[0]),
          ])
        } else if (roundName === 'Semi-finals') {
          const finalRows = await sql<{ play_window_start: string }>(
            `SELECT play_window_start FROM public.rounds WHERE tournament_id = $1 AND round_name = 'Final' LIMIT 1`,
            [match.tournament_id]
          )
          const finalDate = finalRows[0]?.play_window_start
            ? new Date(finalRows[0].play_window_start).toLocaleString('en-ZA', {
                weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                hour12: false, timeZone: 'Africa/Johannesburg',
              })
            : new Date(Date.now() + 3 * 24 * 3600000).toLocaleString('en-ZA', {
                weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                hour12: false, timeZone: 'Africa/Johannesburg',
              })
          await Promise.all([
            sendInTheFinalEmail(w.email, w.name.split(' ')[0], finalDate),
            sendEliminatedEmail(l.email, l.name.split(' ')[0]),
          ])
        } else {
          await Promise.all([
            sendAdvancedEmail(w.email, w.name.split(' ')[0]),
            sendEliminatedEmail(l.email, l.name.split(' ')[0]),
          ])
        }

        await sql(
          `UPDATE public.brackets SET result_alert_sent = true WHERE id = $1`,
          [match.bracket_id]
        )
        console.log(`  [result] ${match.bracket_id}: emails sent`)
      }
    }

    // STEP 2: Find newest generated round (highest round_number with NULL scheduling_deadline)
    const unscheduledRounds = await sql<{ round_number: number }>(
      `SELECT round_number FROM public.rounds
       WHERE tournament_id = $1 AND scheduling_deadline IS NULL
       ORDER BY round_number DESC
       LIMIT 1`,
      [tournamentId]
    )

    if (!unscheduledRounds.length) {
      console.log('  [opponent] no pending rounds to schedule')
    } else {
      const nextRound = unscheduledRounds[0].round_number

      // STEP 3: Set round dates and send opponent emails
      const roundData = await sql<{ round_name: string; play_window_hours?: number }>(
        `SELECT r.round_name,
                (SELECT play_window_hours FROM public.tournaments WHERE id = $1) AS play_window_hours
         FROM public.rounds r
         WHERE r.tournament_id = $1 AND r.round_number = $2`,
        [tournamentId, nextRound]
      )

      if (roundData.length) {
        const r = roundData[0]
        const isFinal = r.round_name === 'Final'
        const pwHours = r.play_window_hours ?? 48

        // Compute dates
        let schedulingDeadline: string
        let playWindowStart: string
        let playWindowEnd: string

        if (isFinal) {
          schedulingDeadline = new Date(Date.now() + 3 * 24 * 3600000).toISOString()
          playWindowStart = schedulingDeadline
          playWindowEnd = schedulingDeadline
        } else {
          schedulingDeadline = new Date(Date.now() + 24 * 3600000).toISOString()
          playWindowStart = schedulingDeadline
          playWindowEnd = new Date(Date.now() + (24 + pwHours) * 3600000).toISOString()
        }

        // Update round
        await sql(
          `UPDATE public.rounds
           SET scheduling_deadline = $1, play_window_start = $2, play_window_end = $3
           WHERE tournament_id = $4 AND round_number = $5`,
          [schedulingDeadline, playWindowStart, playWindowEnd, tournamentId, nextRound]
        )

        // Send opponent emails for matches in this round with opponent_email_sent=false
        const brackets = await sql<{
          bracket_id: string
          participant_a_id: string
          participant_b_id: string
        }>(
          `SELECT id AS bracket_id, participant_a_id, participant_b_id
           FROM public.brackets
           WHERE tournament_id = $1 AND round_number = $2 AND opponent_email_sent = false`,
          [tournamentId, nextRound]
        )

        for (const bracket of brackets) {
          if (bracket.participant_a_id === bracket.participant_b_id) continue // bye

          const players = await sql<{ id: string; name: string; email: string; psn_id: string; youtube_url: string | null }>(
            `SELECT pa.id, pa.name, pa.email, pa.psn_id,
                    (SELECT pl.youtube_url FROM public.players pl WHERE lower(pl.email) = lower(pa.email) LIMIT 1) AS youtube_url
             FROM public.participants pa WHERE pa.id IN ($1, $2)`,
            [bracket.participant_a_id, bracket.participant_b_id]
          )
          const pA = players.find(p => p.id === bracket.participant_a_id)!
          const pB = players.find(p => p.id === bracket.participant_b_id)!

          if (!isFinal) {
            const tokenA = await createMatchToken(pA.id, bracket.bracket_id, 'scheduling', 24)
            const tokenB = await createMatchToken(pB.id, bracket.bracket_id, 'scheduling', 24)
            const playWindow = new Date(playWindowEnd).toLocaleDateString('en-ZA', {
              day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg',
            })
            const deadline = new Date(schedulingDeadline).toLocaleString('en-ZA', {
              weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
              hour12: false, timeZone: 'Africa/Johannesburg',
            })
            await Promise.all([
              sendOpponentEmail(pA.email, pA.name.split(' ')[0], pB.psn_id, r.round_name, playWindow, deadline, tokenA, !!pA.youtube_url),
              sendOpponentEmail(pB.email, pB.name.split(' ')[0], pA.psn_id, r.round_name, playWindow, deadline, tokenB, !!pB.youtube_url),
            ])
          } else {
            const finalAt = playWindowStart
            await sql(
              `INSERT INTO public.scheduled_matches (match_id, scheduled_at)
               VALUES ($1, $2)
               ON CONFLICT (match_id) DO UPDATE SET scheduled_at = $2, confirmed_at = now()`,
              [bracket.bracket_id, finalAt]
            )
            await sql(
              `UPDATE public.brackets SET status = 'active', scheduled_at = $1,
               score_due_at = $1::timestamptz + interval '4 hours' WHERE id = $2`,
              [finalAt, bracket.bracket_id]
            )
            const tokenA = await createMatchToken(pA.id, bracket.bracket_id, 'submission', 80)
            const tokenB = await createMatchToken(pB.id, bracket.bracket_id, 'submission', 80)
            await Promise.all([
              sendScheduleConfirmationEmail(pA.email, pA.name.split(' ')[0], pB.psn_id, finalAt, tokenA),
              sendScheduleConfirmationEmail(pB.email, pB.name.split(' ')[0], pA.psn_id, finalAt, tokenB),
            ])
          }

          await sql(
            `UPDATE public.brackets SET opponent_email_sent = true WHERE id = $1`,
            [bracket.bracket_id]
          )
          console.log(`  [opponent] ${bracket.bracket_id}: emails sent`)
        }

        console.log(`  [round] Round ${nextRound} dates set and opponent emails released`)
      }
    }

    console.log('OK: all alerts released')
    process.exit(0)
  } catch (err: any) {
    console.error('ERROR:', err?.message)
    console.error(err?.stack)
    process.exit(1)
  }
})()
