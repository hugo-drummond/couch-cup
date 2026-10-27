/**
 * resubmit-match.ts — admin reset of a single match back to "submit availability".
 *
 * Unschedules MATCH_ID: drops its scheduled_matches row, resets the bracket to
 * pending (clears scheduled_at / score_due_at / proposed_time_ts, leaves
 * decline_count untouched), wipes both players' submitted windows, then issues
 * fresh 24h scheduling tokens and emails both players a resubmit-availability link.
 *
 * Used when a confirmed time becomes invalid (e.g. it fell inside the scheduling
 * window after that rule changed). Mirrors lib/email.ts transport (SES → Resend).
 *
 * Run from site3 root: npx tsx scripts/resubmit-match.ts
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

const MATCH_ID = 'bce7a4dc-f66a-4064-aaeb-8a0d39c0c3a8'

;(async () => {
  const { sql } = await import('../lib/supabase.ts')
  const { createMatchToken } = await import('../lib/tokens.ts')
  const { sendResubmitAvailabilityEmail } = await import('../lib/email.ts')

  const players = await sql<{ id: string; name: string; email: string }>(`
    SELECT p.id, p.name, p.email
    FROM public.brackets b
    JOIN public.participants p ON p.id = b.participant_a_id OR p.id = b.participant_b_id
    WHERE b.id = $1
  `, [MATCH_ID])

  if (players.length < 2) {
    console.error(`Expected 2 players for match ${MATCH_ID}, got ${players.length}. Aborting.`)
    process.exit(1)
  }

  await sql(`DELETE FROM public.scheduled_matches WHERE match_id = $1`, [MATCH_ID])
  await sql(`
    UPDATE public.brackets
    SET status = 'pending', scheduled_at = NULL, score_due_at = NULL, proposed_time_ts = NULL
    WHERE id = $1
  `, [MATCH_ID])
  await sql(`DELETE FROM public.match_availability WHERE match_id = $1`, [MATCH_ID])

  for (const p of players) {
    const token = await createMatchToken(p.id, MATCH_ID, 'scheduling', 24)
    await sendResubmitAvailabilityEmail(p.email, p.name.split(' ')[0], token)
    console.log(`Reset + emailed ${p.name} <${p.email}>`)
  }

  console.log('Done.')
  process.exit(0)
})()
