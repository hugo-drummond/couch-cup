/**
 * send-selection-review.ts
 * Sends ONE review copy of the real selection email to TEST_EMAIL.
 * Uses the production sendSelectionEmail() — exact template, subject, links, SES path.
 * Token is a placeholder (links are structurally correct but won't resolve).
 * No participant tokens minted, no participant emails sent.
 * Run from site3 root: npx tsx scripts/send-selection-review.ts
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
  const { sendSelectionEmail } = await import('../lib/email.ts')
  await sendSelectionEmail(process.env.TEST_EMAIL!, 'Player', 'PREVIEW-TOKEN-NOT-LIVE')
  console.log('Review copy sent to TEST_EMAIL')
})()
