/**
 * send-draw-result-review.ts — ONE review copy of the Season 1 draw-result
 * broadcast email to TEST_EMAIL. No participant send.
 * Mirrors lib/email.ts sendEmail: SES primary, Resend fallback, FROM_EMAIL.
 * Run from site3 root: npx tsx scripts/send-draw-result-review.ts
 */
import { readFileSync } from 'fs'
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
const TO = process.env.TEST_EMAIL!

;(async () => {
  const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2')
  const { Resend } = await import('resend')

  const FROM = `Couch Cup <${process.env.FROM_EMAIL}>`
  const template = readFileSync(join(__dir, '..', 'lib/email-templates/season1-draw-result.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', 'Player')
    .replace('{{DISCORD_LINK}}', DISCORD_LINK)
    .replace('{{INSTAGRAM_LINK}}', INSTAGRAM_LINK)

  const ses = new SESv2Client({ region: process.env.AWS_REGION ?? 'eu-west-1' })
  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [TO] },
      Content: { Simple: { Subject: { Data: SUBJECT }, Body: { Html: { Data: html } } } },
    }))
    console.log('Review copy sent via SES to', TO)
  } catch (err) {
    console.error('[email] SES failed, falling back to Resend:', err)
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: FROM, to: TO, subject: SUBJECT, html })
    console.log('Review copy sent via Resend to', TO)
  }
})()
