/**
 * send-availability-reminder-live.ts — LIVE broadcast of the availability reminder
 * email to players in Round 2 who have not yet submitted their availability.
 *
 * Calls lib/email.ts sendAvailabilityReminderEmail (SES primary, Resend fallback).
 * Idempotent: appends each sent address to scripts/.sent-availability-reminder.json and
 * skips anyone already in it, so a rerun only sends to those still missing.
 * Refuses to run if the recipient count is not exactly 5.
 *
 * Run from site3 root: npx tsx scripts/send-availability-reminder-live.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

const EXPECTED_COUNT = 5
const SENT_LOG = join(__dir, '.sent-availability-reminder.json')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const { sql } = await import('../lib/supabase.ts')
  const { sendAvailabilityReminderEmail } = await import('../lib/email.ts')

  // Round 2 players who have not yet submitted availability
  const rows = await sql<{ name: string; email: string; token: string; expires_at: string; has_yt: boolean }>(
    `WITH r2 AS (
      SELECT id AS match_id, participant_a_id, participant_b_id
      FROM public.brackets WHERE round_number = 2
    ),
    prows AS (
      SELECT match_id, participant_a_id AS pid FROM r2
      UNION ALL
      SELECT match_id, participant_b_id FROM r2
    ),
    live_tok AS (
      SELECT DISTINCT ON (player_id, match_id) player_id, match_id, token, expires_at
      FROM public.match_tokens
      WHERE type = 'scheduling' AND used_at IS NULL AND expires_at > now()
      ORDER BY player_id, match_id, expires_at DESC
    )
    SELECT p.name, p.email, lt.token, lt.expires_at,
           (pg.youtube_url IS NOT NULL AND pg.youtube_url <> '') AS has_yt
    FROM prows pr
    JOIN public.participants p ON p.id = pr.pid
    JOIN live_tok lt ON lt.player_id = pr.pid AND lt.match_id = pr.match_id
    LEFT JOIN public.players pg ON lower(pg.email) = lower(p.email)
    WHERE (SELECT count(*) FROM public.match_availability ma
           WHERE ma.match_id = pr.match_id AND ma.player_id = pr.pid) = 0
    ORDER BY p.name`
  )

  // Dedupe by lower(trim(email)); keep first occurrence; skip blanks
  const byKey = new Map<string, { name: string; email: string; token: string; expires_at: string; has_yt: boolean }>()
  let blanks = 0
  for (const r of rows) {
    const key = (r.email || '').toLowerCase().trim()
    if (!key) { blanks++; continue }
    if (!byKey.has(key)) byKey.set(key, { name: r.name || '', email: r.email.trim(), token: r.token, expires_at: r.expires_at, has_yt: r.has_yt })
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
    const hoursLeft = Math.max(0, Math.floor((new Date(r.expires_at).getTime() - Date.now()) / 3600000))
    const includeStreamingAsk = !r.has_yt
    try {
      await sendAvailabilityReminderEmail(r.email, firstName, hoursLeft, r.token, includeStreamingAsk)
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
