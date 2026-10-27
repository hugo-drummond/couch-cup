/**
 * send-draw-result-live.ts — LIVE broadcast of the Season 1 draw-result email
 * to ALL signups (public.participants), deduped by email. Includes the 32
 * selected and the 2 Xbox users — everyone.
 *
 * Mirrors lib/email.ts sendEmail: SES primary, Resend fallback, FROM_EMAIL.
 * Idempotent: appends each sent address to scripts/.sent-draw-result.json and
 * skips anyone already in it, so a rerun only sends to those still missing.
 *
 * Run from site3 root: npx tsx scripts/send-draw-result-live.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

const DISCORD_LINK = 'https://discord.gg/Kz4qrFUgKJ'
const INSTAGRAM_LINK = 'https://www.instagram.com/couchcup'
const SUBJECT = 'Your Season 1 selection is here (check your inbox)'
const SENT_LOG = join(__dir, '.sent-draw-result.json')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const { sql } = await import('../lib/supabase.ts')
  const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2')
  const { Resend } = await import('resend')

  const FROM = `Couch Cup <${process.env.FROM_EMAIL}>`
  const template = readFileSync(join(__dir, '..', 'lib/email-templates/season1-draw-result.html'), 'utf-8')
  const ses = new SESv2Client({ region: process.env.AWS_REGION ?? 'eu-west-1' })
  const resend = new Resend(process.env.RESEND_API_KEY)

  // All signups
  const rows = await sql<{ name: string; email: string }>(
    `SELECT name, email FROM public.participants ORDER BY signup_timestamp ASC`
  )

  // Dedupe by lower(trim(email)); keep first occurrence; skip blanks
  const byKey = new Map<string, { name: string; email: string }>()
  let blanks = 0
  for (const r of rows) {
    const key = (r.email || '').toLowerCase().trim()
    if (!key) { blanks++; continue }
    if (!byKey.has(key)) byKey.set(key, { name: r.name || '', email: r.email.trim() })
  }

  // Idempotency: skip already-sent
  const sentLog: string[] = existsSync(SENT_LOG) ? JSON.parse(readFileSync(SENT_LOG, 'utf-8')) : []
  const sentSet = new Set(sentLog.map(e => e.toLowerCase().trim()))

  const recipients = [...byKey.entries()].filter(([key]) => !sentSet.has(key))

  console.log(`\nTotal participant rows:      ${rows.length}`)
  console.log(`Blank/null emails skipped:   ${blanks}`)
  console.log(`Unique addresses:            ${byKey.size}`)
  console.log(`Already sent (skipped):      ${byKey.size - recipients.length}`)
  console.log(`To send now:                 ${recipients.length}\n`)
  if (!recipients.length) { console.log('Nothing to send.'); return }

  let sent = 0
  const failures: string[] = []

  for (const [key, r] of recipients) {
    const firstName = (r.name || '').trim().split(/\s+/)[0] || 'there'
    const html = template
      .replace('{{FIRST_NAME}}', firstName)
      .replace('{{DISCORD_LINK}}', DISCORD_LINK)
      .replace('{{INSTAGRAM_LINK}}', INSTAGRAM_LINK)
    try {
      try {
        await ses.send(new SendEmailCommand({
          FromEmailAddress: FROM,
          Destination: { ToAddresses: [r.email] },
          Content: { Simple: { Subject: { Data: SUBJECT }, Body: { Html: { Data: html } } } },
        }))
      } catch (sesErr) {
        await resend.emails.send({ from: FROM, to: r.email, subject: SUBJECT, html })
      }
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
