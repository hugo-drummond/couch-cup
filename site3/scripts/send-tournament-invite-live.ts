/**
 * send-tournament-invite-live.ts — Day-0 tournament-invite blast to the marketing
 * opt-in list (participants ∪ players where marketing_opt_in = true).
 *
 * Each recipient gets a signed HMAC token; the email carries "sign up" and
 * "not interested" links (tournament-scoped). Idempotent: logs sent addresses to
 * .sent-tournament-invite.json and skips on rerun.
 *
 * Resolves the tournament by status='registration' (the one open for signups).
 *
 * Run from site3 root:
 *   npx tsx scripts/send-tournament-invite-live.ts          # live: full opt-in list
 *   npx tsx scripts/send-tournament-invite-live.ts --test   # only the 2 test inboxes
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

const TEST = process.argv.includes('--test')
const TEST_RECIPIENTS = [
  { name: 'Player One', email: process.env.TEST_EMAIL! },
  { name: 'Player Two', email: 'player-two@example.com' },
]

const SENT_LOG = join(__dir, '.sent-tournament-invite.json')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const { sql } = await import('../lib/supabase.ts')
  const { sendTournamentInviteEmail } = await import('../lib/email.ts')
  const { signInviteToken } = await import('../lib/invite-tokens.ts')

  const tours = await sql<{ id: string; name: string; game: string; prize: string }>(
    `SELECT id, name, game, prize FROM public.tournaments
     WHERE status = 'registration' ORDER BY created_at DESC LIMIT 1`
  )
  const tour = tours[0]
  if (!tour) {
    console.log('No tournament with status=registration. Open one before blasting.')
    return
  }
  console.log(`\nTournament: ${tour.name} (${tour.game}) — ${tour.prize}`)
  if (TEST) console.log('*** TEST MODE — only the 2 test inboxes, no idempotency log ***')

  // Build recipient list.
  let recipients: { name: string; email: string }[]
  if (TEST) {
    recipients = TEST_RECIPIENTS
  } else {
    const rows = await sql<{ name: string; email: string }>(
      `SELECT DISTINCT email, name FROM participants WHERE marketing_opt_in = true
       UNION
       SELECT DISTINCT email, name FROM players WHERE marketing_opt_in = true`
    )
    const byKey = new Map<string, { name: string; email: string }>()
    for (const r of rows) {
      const key = (r.email || '').toLowerCase().trim()
      if (!key) continue
      if (!byKey.has(key)) byKey.set(key, { name: r.name || '', email: r.email.trim() })
    }
    const sentLog: string[] = existsSync(SENT_LOG) ? JSON.parse(readFileSync(SENT_LOG, 'utf-8')) : []
    const sentSet = new Set(sentLog.map((e: string) => e.toLowerCase().trim()))
    recipients = [...byKey.values()].filter(r => !sentSet.has(r.email.toLowerCase().trim()))
    console.log(`Marketing opt-in recipients: ${byKey.size}`)
    console.log(`Already sent (skipped):      ${byKey.size - recipients.length}`)
  }

  console.log(`To send now:                 ${recipients.length}\n`)
  if (!recipients.length) { console.log('Nothing to send.'); return }

  const sentLog: string[] = !TEST && existsSync(SENT_LOG) ? JSON.parse(readFileSync(SENT_LOG, 'utf-8')) : []
  let sent = 0
  const failures: string[] = []

  for (const r of recipients) {
    const firstName = (r.name || '').trim().split(/\s+/)[0] || 'there'
    try {
      const token = signInviteToken(r.email, tour.id)
      await sendTournamentInviteEmail(r.email, firstName, token, { name: tour.name, game: tour.game, prize: tour.prize })
      if (!TEST) {
        sentLog.push(r.email.toLowerCase().trim())
        writeFileSync(SENT_LOG, JSON.stringify(sentLog, null, 2))
      }
      sent++
      console.log(`  ✓ ${r.email}`)
    } catch (e: any) {
      failures.push(`${r.email}: ${e.message}`)
      console.log(`  ✗ ${r.email}: ${e.message}`)
    }
    await sleep(300)
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`  SENT: ${sent}/${recipients.length}`)
  if (failures.length) {
    console.log(`  FAILURES (${failures.length}) — rerun to retry:`)
    failures.forEach(f => console.log(`    • ${f}`))
  } else {
    console.log(`  All sent cleanly.`)
  }
  console.log(`${'='.repeat(50)}\n`)
})()
