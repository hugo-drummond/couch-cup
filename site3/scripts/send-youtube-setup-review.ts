/**
 * send-youtube-setup-review.ts — ONE review copy of the YouTube streaming
 * setup email to TEST_EMAIL. No participant send.
 * Calls lib/email.ts sendYoutubeSetupEmail (SES primary, Resend fallback).
 * Run from site3 root: npx tsx scripts/send-youtube-setup-review.ts
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

const TO = process.env.TEST_EMAIL!

;(async () => {
  const { sendYoutubeSetupEmail } = await import('../lib/email.ts')
  try {
    await sendYoutubeSetupEmail(TO, 'Player')
    console.log('Review copy sent to', TO)
  } catch (err) {
    console.error('Review copy FAILED to', TO, err)
    process.exitCode = 1
  }
})()
