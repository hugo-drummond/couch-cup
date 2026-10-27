/**
 * send-season2-test.ts — one-off test of the Season 2 teaser email to TEST_EMAIL only.
 * Run from site3 root: npx tsx scripts/send-season2-test.ts
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
  const { sendSeason2TeaserEmail } = await import('../lib/email.ts')
  await sendSeason2TeaserEmail(process.env.TEST_EMAIL!, 'Player')
  console.log('✓ Test email sent to TEST_EMAIL')
})()
