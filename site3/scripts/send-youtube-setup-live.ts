/**
 * send-youtube-setup-live.ts — LIVE broadcast of the YouTube streaming setup
 * email to the 32 currently-invited Season 1 players (waitlist_entries with
 * status 'selected' or 'accepted' for the Season 1 tournament).
 *
 * Calls lib/email.ts sendYoutubeSetupEmail (SES primary, Resend fallback).
 * Idempotent: appends each sent address to scripts/.sent-youtube-setup.json and
 * skips anyone already in it, so a rerun only sends to those still missing.
 * Refuses to run if the recipient count is not exactly 32.
 *
 * Run from site3 root: npx tsx scripts/send-youtube-setup-live.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

const TOURNAMENT_ID = 'cc76b2fc-32db-4760-b7a2-83c608a03964'
const EXPECTED_COUNT = 32
const SENT_LOG = join(__dir, '.sent-youtube-setup.json')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const { sql } = await import('../lib/supabase.ts')
  const { sendYoutubeSetupEmail } = await import('../lib/email.ts')

  // The 32 currently-invited Season 1 players
  const rows = await sql<{ name: string; email: string }>(
    `SELECT p.name, p.email
     FROM public.waitlist_entries we
     JOIN public.players p ON p.id = we.player_id
     WHERE we.tournament_id = $1 AND we.status IN ('selected','accepted')`,
    [TOURNAMENT_ID]
  )

  // Dedupe by lower(trim(email)); keep first occurrence; skip blanks
  const byKey = new Map<string, { name: string; email: string }>()
  let blanks = 0
  for (const r of rows) {
    const key = (r.email || '').toLowerCase().trim()
    if (!key) { blanks++; continue }
    if (!byKey.has(key)) byKey.set(key, { name: r.name || '', email: r.email.trim() })
  }

  console.log(`\nMatched player rows:         ${rows.length}`)
  console.log(`Blank/null emails skipped:   ${blanks}`)
  console.log(`Unique addresses:            ${byKey.size}`)

  // Safety: refuse to send to the wrong set
  if (byKey.size !== EXPECTED_COUNT) {
    console.error(`\nABORT: expected ${EXPECTED_COUNT} unique recipients but found ${byKey.size}. No emails sent.`)
    process.exitCode = 1
    return
  }

  // Idempotency: skip already-sent
  const sentLog: string[] = existsSync(SENT_LOG) ? JSON.parse(readFileSync(SENT_LOG, 'utf-8')) : []
  const sentSet = new Set(sentLog.map(e => e.toLowerCase().trim()))

  const recipients = [...byKey.entries()].filter(([key]) => !sentSet.has(key))

  console.log(`Already sent (skipped):      ${byKey.size - recipients.length}`)
  console.log(`To send now:                 ${recipients.length}\n`)
  if (!recipients.length) { console.log('Nothing to send.'); return }

  let sent = 0
  const failures: string[] = []

  for (const [key, r] of recipients) {
    const firstName = (r.name || '').trim().split(/\s+/)[0] || 'there'
    try {
      await sendYoutubeSetupEmail(r.email, firstName)
      sentLog.push(key)
      writeFileSync(SENT_LOG, JSON.stringify(sentLog, null, 2))
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
