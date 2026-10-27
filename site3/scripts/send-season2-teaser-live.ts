/**
 * send-season2-teaser-live.ts — Season 1 wrap + Season 2 teaser to all marketing-opted-in players.
 * Queries both participants and players tables; dedupes by email.
 * Idempotent: logs sent addresses to .sent-season2-teaser.json and skips on rerun.
 *
 * Run from site3 root: npx tsx scripts/send-season2-teaser-live.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

const SENT_LOG = join(__dir, '.sent-season2-teaser.json')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const { sql } = await import('../lib/supabase.ts')
  const { sendSeason2TeaserEmail } = await import('../lib/email.ts')

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

  console.log(`\nMarketing opt-in recipients: ${byKey.size}`)

  const sentLog: string[] = existsSync(SENT_LOG) ? JSON.parse(readFileSync(SENT_LOG, 'utf-8')) : []
  const sentSet = new Set(sentLog.map((e: string) => e.toLowerCase().trim()))
  const recipients = [...byKey.entries()].filter(([key]) => !sentSet.has(key))

  console.log(`Already sent (skipped):      ${byKey.size - recipients.length}`)
  console.log(`To send now:                 ${recipients.length}\n`)
  if (!recipients.length) { console.log('Nothing to send.'); return }

  let sent = 0
  const failures: string[] = []

  for (const [key, r] of recipients) {
    const name = (r.name || '').trim().split(/\s+/)[0] || 'there'
    try {
      await sendSeason2TeaserEmail(r.email, name)
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
