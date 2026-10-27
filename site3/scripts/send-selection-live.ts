/**
 * send-selection-live.ts  — LIVE participant send.
 *
 * Sends the real "You've been selected" acceptance email to the 32 SELECTED
 * players in tournament cc76b2fc (status='selected'). Mirrors the production
 * promotion path in app/api/tournament/advance/route.ts exactly:
 *   createPlayerToken(player_id, tournament_id, 'acceptance', 24)  -> 24h token
 *   sendSelectionEmail(email, firstName, token)                    -> SES/Resend
 *   UPDATE waitlist_entries SET selected_at = now()
 *
 * Idempotent: only targets selected entries that have NO valid unused acceptance
 * token. Rerun after a full success sends 0. If a send fails, the just-minted
 * token is deleted so a rerun retries that player.
 *
 * Run from site3 root:  npx tsx scripts/send-selection-live.ts
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
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const { sql } = await import('../lib/supabase.ts')
  const { createPlayerToken } = await import('../lib/tokens.ts')
  const { sendSelectionEmail } = await import('../lib/email.ts')

  const targets = await sql<{ entry_id: string; player_id: string; name: string; email: string }>(
    `SELECT we.id AS entry_id, we.player_id, p.name, p.email
     FROM public.waitlist_entries we
     JOIN public.players p ON p.id = we.player_id
     WHERE we.tournament_id = $1
       AND we.status = 'selected'
       AND NOT EXISTS (
         SELECT 1 FROM public.player_tokens pt
         WHERE pt.player_id = we.player_id
           AND pt.tournament_id = we.tournament_id
           AND pt.type = 'acceptance'
           AND pt.used_at IS NULL
           AND pt.expires_at > now()
       )
     ORDER BY p.name`,
    [TOURNAMENT_ID]
  )

  console.log(`\nTournament: ${TOURNAMENT_ID}`)
  console.log(`Targets needing send: ${targets.length}\n`)
  if (!targets.length) {
    console.log('Nothing to send. (All selected players already have a live token.)')
    return
  }

  let sent = 0
  const failures: string[] = []

  for (const t of targets) {
    const firstName = (t.name || '').trim().split(/\s+/)[0] || 'there'
    let token: string | null = null
    try {
      token = await createPlayerToken(t.player_id, TOURNAMENT_ID, 'acceptance', 24)
      try {
        await sendSelectionEmail(t.email, firstName, token)
      } catch (sendErr: any) {
        await sql(`DELETE FROM public.player_tokens WHERE token = $1`, [token])
        throw sendErr
      }
      await sql(`UPDATE public.waitlist_entries SET selected_at = now() WHERE id = $1`, [t.entry_id])
      sent++
      console.log(`  ✓ ${t.name} <${t.email}>`)
    } catch (e: any) {
      failures.push(`${t.name} <${t.email}>: ${e.message}`)
      console.log(`  ✗ ${t.name} <${t.email}>: ${e.message}`)
    }
    await sleep(300)
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`  SENT: ${sent}/${targets.length}`)
  console.log(`  Tokens: 24h acceptance, type='acceptance'`)
  if (failures.length) {
    console.log(`  FAILURES (${failures.length}) — rerun to retry these:`)
    failures.forEach(f => console.log(`    • ${f}`))
  } else {
    console.log(`  All sent cleanly.`)
  }
  console.log(`${'='.repeat(50)}\n`)
})()
