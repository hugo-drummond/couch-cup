/**
 * generate-round.ts — manually trigger generateNextRound for a tournament
 * Usage: cd site3 && npx tsx scripts/generate-round.ts
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (m) process.env[m[1].trim()] = m[2].replace(/\\n$/, '').trim()
})

const TOURNAMENT_ID = 'cc76b2fc-32db-4760-b7a2-83c608a03964'
const COMPLETED_ROUND = 1

;(async () => {
  const { generateNextRound } = await import('../lib/tournament-advance.ts')
  console.log(`Generating Round ${COMPLETED_ROUND + 1} for tournament ${TOURNAMENT_ID}...`)
  try {
    const result = await generateNextRound(TOURNAMENT_ID, COMPLETED_ROUND)
    console.log('RESULT:', JSON.stringify(result, null, 2))
    console.log('OK: round generated')
  } catch (err: any) {
    console.error('ERROR:', err?.message)
    console.error(err?.stack)
    process.exit(1)
  }
  process.exit(0)
})()
