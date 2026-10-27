/**
 * schedule-final-manual.ts — manually schedule a Final match with emails
 * Usage: cd site3 && npx tsx scripts/schedule-final-manual.ts
 * Environment: DRY_RUN=0 to send emails; default is DRY_RUN=1 (dry-run only)
 *
 * Behaviour:
 * 1. Fetch Final bracket (round 5) and its two finalists
 * 2. Fetch Semi-final losers (round 4 non-winners)
 * 3. For Final: update bracket (active, scheduled_at, score_due_at), insert scheduled_matches, create submission tokens, send schedule-confirmation emails
 * 4. For SF losers: send eliminated emails, set result_alert_sent=true
 * 5. All DB writes & emails guarded by DRY_RUN flag; print full summary
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

;(async () => {
  const TOURNAMENT_ID = 'cc76b2fc-32db-4760-b7a2-83c608a03964'
  const KICKOFF = '2026-07-06T18:00:00Z'
  const SCORE_DUE = '2026-07-06T22:00:00Z'
  const DRY_RUN = process.env.DRY_RUN !== '0'

  const { sql } = await import('../lib/supabase.ts')
  const { createMatchToken } = await import('../lib/tokens.ts')
  const {
    sendScheduleConfirmationEmail,
    sendEliminatedEmail,
  } = await import('../lib/email.ts')

  try {
    console.log(`[${DRY_RUN ? 'DRY_RUN' : 'LIVE'}] Scheduling Final for tournament ${TOURNAMENT_ID}...`)
    console.log(`  kickoff: ${KICKOFF}`)
    console.log(`  score_due: ${SCORE_DUE}`)

    // STEP 1: Fetch Final bracket (round 5)
    const finalBrackets = await sql<{
      id: string
      participant_a_id: string
      participant_b_id: string
    }>(
      `SELECT id, participant_a_id, participant_b_id
       FROM public.brackets
       WHERE tournament_id = $1 AND round_number = 5`,
      [TOURNAMENT_ID]
    )

    if (!finalBrackets.length) {
      throw new Error('No Final bracket found (round 5)')
    }
    if (finalBrackets.length > 1) {
      throw new Error(`Expected 1 Final bracket, found ${finalBrackets.length}`)
    }

    const finalBracket = finalBrackets[0]
    console.log(`  Final bracket: ${finalBracket.id}`)

    // Fetch finalist details
    const finalists = await sql<{ id: string; name: string; email: string; psn_id: string }>(
      `SELECT id, name, email, psn_id FROM public.participants
       WHERE id IN ($1, $2)`,
      [finalBracket.participant_a_id, finalBracket.participant_b_id]
    )

    if (finalists.length !== 2) {
      throw new Error(`Expected 2 finalists, found ${finalists.length}`)
    }

    const finalistA = finalists.find(f => f.id === finalBracket.participant_a_id)!
    const finalistB = finalists.find(f => f.id === finalBracket.participant_b_id)!

    console.log(`  Finalist A: ${finalistA.email} (psn: ${finalistA.psn_id})`)
    console.log(`  Finalist B: ${finalistB.email} (psn: ${finalistB.psn_id})`)

    // STEP 2: Fetch Semi-final losers (round 4)
    const sfMatches = await sql<{
      id: string
      winner_id: string
      participant_a_id: string
      participant_b_id: string
    }>(
      `SELECT id, winner_id, participant_a_id, participant_b_id
       FROM public.brackets
       WHERE tournament_id = $1 AND round_number = 4 AND status = 'completed' AND winner_id IS NOT NULL`,
      [TOURNAMENT_ID]
    )

    if (sfMatches.length !== 2) {
      throw new Error(`Expected 2 completed SF matches, found ${sfMatches.length}`)
    }

    const sfLoserIds = sfMatches.map(m =>
      m.winner_id === m.participant_a_id ? m.participant_b_id : m.participant_a_id
    )

    const sfLosers = await sql<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM public.participants
       WHERE id IN ($1, $2)`,
      [sfLoserIds[0], sfLoserIds[1]]
    )

    if (sfLosers.length !== 2) {
      throw new Error(`Expected 2 SF losers, found ${sfLosers.length}`)
    }

    console.log(`  SF Loser 1: ${sfLosers[0].email}`)
    console.log(`  SF Loser 2: ${sfLosers[1].email}`)

    // STEP 3: Schedule Final match
    console.log('\n[FINAL] Updating bracket...')
    if (!DRY_RUN) {
      await sql(
        `UPDATE public.brackets SET status = 'active', scheduled_at = $1, score_due_at = $2, opponent_email_sent = true WHERE id = $3`,
        [KICKOFF, SCORE_DUE, finalBracket.id]
      )
    } else {
      console.log(`[DRY] would UPDATE brackets SET status='active', scheduled_at='${KICKOFF}', score_due_at='${SCORE_DUE}', opponent_email_sent=true WHERE id='${finalBracket.id}'`)
    }

    console.log('[FINAL] Inserting scheduled_matches...')
    if (!DRY_RUN) {
      await sql(
        `INSERT INTO public.scheduled_matches (match_id, scheduled_at)
         VALUES ($1, $2)
         ON CONFLICT (match_id) DO UPDATE SET scheduled_at = $2, confirmed_at = now()`,
        [finalBracket.id, KICKOFF]
      )
    } else {
      console.log(`[DRY] would INSERT INTO public.scheduled_matches (match_id, scheduled_at) VALUES ('${finalBracket.id}', '${KICKOFF}')`)
    }

    // Create submission tokens for both finalists
    console.log('[FINAL] Creating submission tokens...')
    let tokenA = ''
    let tokenB = ''
    if (!DRY_RUN) {
      tokenA = await createMatchToken(finalistA.id, finalBracket.id, 'submission', 80)
      tokenB = await createMatchToken(finalistB.id, finalBracket.id, 'submission', 80)
    } else {
      console.log(`[DRY] would create submission token (80h) for ${finalistA.email}`)
      console.log(`[DRY] would create submission token (80h) for ${finalistB.email}`)
      tokenA = '<token-A-dry>'
      tokenB = '<token-B-dry>'
    }

    // Send schedule confirmation emails
    console.log('[FINAL] Sending schedule confirmation emails...')
    if (!DRY_RUN) {
      await Promise.all([
        sendScheduleConfirmationEmail(finalistA.email, finalistA.name.split(' ')[0], finalistB.psn_id, KICKOFF, tokenA),
        sendScheduleConfirmationEmail(finalistB.email, finalistB.name.split(' ')[0], finalistA.psn_id, KICKOFF, tokenB),
      ])
    } else {
      console.log(`[DRY] would send schedule_confirmation email to ${finalistA.email}, firstName='${finalistA.name.split(' ')[0]}', opponentPsn='${finalistB.psn_id}', scheduledAt='${KICKOFF}', scoreToken='${tokenA}'`)
      console.log(`[DRY] would send schedule_confirmation email to ${finalistB.email}, firstName='${finalistB.name.split(' ')[0]}', opponentPsn='${finalistA.psn_id}', scheduledAt='${KICKOFF}', scoreToken='${tokenB}'`)
    }
    console.log('  ✓ finalists notified')

    // STEP 4: Send eliminated emails to SF losers
    console.log('\n[SF LOSERS] Sending eliminated emails...')
    for (const loser of sfLosers) {
      const firstName = loser.name.split(' ')[0]
      if (!DRY_RUN) {
        await sendEliminatedEmail(loser.email, firstName)
      } else {
        console.log(`[DRY] would send eliminated email to ${loser.email}, firstName='${firstName}'`)
      }
    }
    console.log('  ✓ losers notified')

    // Update SF brackets to mark result_alert_sent=true
    console.log('[SF LOSERS] Updating brackets...')
    for (const match of sfMatches) {
      if (!DRY_RUN) {
        await sql(
          `UPDATE public.brackets SET result_alert_sent = true WHERE id = $1`,
          [match.id]
        )
      } else {
        console.log(`[DRY] would UPDATE brackets SET result_alert_sent=true WHERE id='${match.id}'`)
      }
    }

    // Summary
    const emailCount = !DRY_RUN ? 4 : 0
    console.log(`\n${DRY_RUN ? 'DRY_RUN' : 'LIVE'} — ${DRY_RUN ? 'nothing sent' : `sent ${emailCount} emails`}`)
    console.log('OK: Final scheduled')
    process.exit(0)
  } catch (err: any) {
    console.error('ERROR:', err?.message)
    console.error(err?.stack)
    process.exit(1)
  }
})()
