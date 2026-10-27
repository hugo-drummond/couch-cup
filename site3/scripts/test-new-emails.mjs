import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = {}
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (match) env[match[1].trim()] = match[2].replace(/\\n$/, '').trim()
})

const BASE_URL = env.NEXT_PUBLIC_SITE_URL ?? 'https://couchcup.co.za'

async function sql(q) {
  const res = await fetch('https://api.supabase.com/v1/projects/rnoavvjxiozlyrulffal/database/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.SUPABASE_MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q })
  })
  const data = await res.json()
  if (data?.message) throw new Error(data.message)
  return data
}

const TEST_EMAILS = ['player-one@example.com', 'player-two@example.com', 'player-three@example.com', 'player-four@example.com']
const T = 'EA FC Season 1 — Test'

// Clean previous test data. Participant-centric: kill any bracket referencing a test
// participant (covers leftovers under any tournament), then the participants themselves.
const emailIn = `('${TEST_EMAILS.join("','")}')`
const refBrackets = `SELECT id FROM public.brackets WHERE participant_a_id IN (SELECT id FROM public.participants WHERE email IN ${emailIn}) OR participant_b_id IN (SELECT id FROM public.participants WHERE email IN ${emailIn})`
await sql(`DELETE FROM public.admin_reviews WHERE match_id IN (${refBrackets})`)
await sql(`DELETE FROM public.score_reports WHERE bracket_id IN (${refBrackets})`)
await sql(`DELETE FROM public.scheduled_matches WHERE match_id IN (${refBrackets})`)
await sql(`DELETE FROM public.match_tokens WHERE match_id IN (${refBrackets})`)
await sql(`DELETE FROM public.match_availability WHERE match_id IN (${refBrackets})`)
await sql(`DELETE FROM public.brackets WHERE id IN (${refBrackets})`)
await sql(`DELETE FROM public.match_tokens WHERE player_id IN (SELECT id FROM public.participants WHERE email IN ${emailIn})`)
await sql(`DELETE FROM public.participants WHERE email IN ${emailIn}`)
await sql(`DELETE FROM public.rounds WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name = '${T}')`)
await sql(`DELETE FROM public.tournaments WHERE name = '${T}'`)
console.log('✓ previous test data cleared')

// Tournament + round 1
const tournaments = await sql(`INSERT INTO public.tournaments (name, game, max_participants, status) VALUES ('${T}', 'EA FC 26', 32, 'active') RETURNING id`)
const tournamentId = tournaments[0].id
await sql(`INSERT INTO public.rounds (tournament_id, round_number, round_name, scheduling_deadline, play_window_start, play_window_end) VALUES ('${tournamentId}', 1, 'Round 1', now() + interval '12 hours', now() + interval '1 day', now() + interval '3 days')`)
console.log(`✓ tournament + round 1: ${tournamentId}`)

// Participants: Player One + Player Two
const pA = await sql(`INSERT INTO public.participants (name, email, psn_id, status) VALUES ('Player One', 'player-one@example.com', 'PlayerOne_Test', 'bracket') RETURNING id`)
const pB = await sql(`INSERT INTO public.participants (name, email, psn_id, status) VALUES ('Test Opponent', 'player-two@example.com', 'OpponentPSN_Test', 'bracket') RETURNING id`)
const [hugoId, antId] = [pA[0].id, pB[0].id]
console.log(`✓ participants A=${hugoId} B=${antId}`)

// --- TEST 1: invite-role + 2h reminder ---
// bracket active, scheduled in 2h, 2h reminder not yet sent, no invite sender chosen
const b1 = await sql(`INSERT INTO public.brackets (tournament_id, round_number, position, participant_a_id, participant_b_id, status) VALUES ('${tournamentId}', 1, 1, '${hugoId}', '${antId}', 'active') RETURNING id`)
const bracket1 = b1[0].id
await sql(`INSERT INTO public.scheduled_matches (match_id, scheduled_at, confirmed_at, reminder_24h_sent, reminder_2h_sent, score_window_open_sent) VALUES ('${bracket1}', now() + interval '2 hours', now(), true, false, true)`)
console.log(`✓ test 1 bracket (invite-role): ${bracket1}`)

// --- TEST 2: rematch (both reported a draw) ---
// bracket active, both score_reports a draw -> triggerRematch.
// Insert NOT-yet-expired so the live 15-min pg_cron can't catch it with 0 reports
// (that race hits the 0-reports branch). Add both reports, THEN flip score_due to the
// past so it only becomes eligible once both draws exist.
const b2 = await sql(`INSERT INTO public.brackets (tournament_id, round_number, position, participant_a_id, participant_b_id, status, score_due_at) VALUES ('${tournamentId}', 1, 2, '${hugoId}', '${antId}', 'active', now() + interval '10 minutes') RETURNING id`)
const bracket2 = b2[0].id
await sql(`INSERT INTO public.score_reports (bracket_id, reporter_id, claimed_winner, score_reporter, score_opponent, went_to_penalties) VALUES ('${bracket2}', '${hugoId}', NULL, 2, 2, false)`)
await sql(`INSERT INTO public.score_reports (bracket_id, reporter_id, claimed_winner, score_reporter, score_opponent, went_to_penalties) VALUES ('${bracket2}', '${antId}', NULL, 2, 2, false)`)
await sql(`UPDATE public.brackets SET score_due_at = now() - interval '5 minutes' WHERE id = '${bracket2}'`)
console.log(`✓ test 2 bracket (rematch): ${bracket2}`)

// Fire the cron tick. Reuse the exact URL + Bearer the pg_cron job uses (kept out of
// shell/env). Must use the cron's own host: a www<->non-www redirect strips Authorization.
const jobRows = await sql(`SELECT command FROM cron.job WHERE jobname = 'tournament-advance' LIMIT 1`)
const cmd = jobRows[0]?.command ?? ''
const advanceUrl = cmd.match(/url:='([^']+)'/)?.[1]
const authHeader = cmd.match(/"Authorization":"(Bearer [a-f0-9]+)/)?.[1]
if (!advanceUrl || !authHeader) { console.error('could not resolve cron url/auth'); process.exit(1) }

console.log(`\n→ calling ${advanceUrl} ...`)
const res = await fetch(advanceUrl, { headers: { 'Authorization': authHeader }, redirect: 'manual' })
const out = await res.json()
console.log(`HTTP ${res.status}`)
console.log(JSON.stringify(out, null, 2))

// Verify rematch actually fired (draw_count incremented + reports cleared by triggerRematch),
// regardless of whether our manual tick or the live pg_cron did it.
const b2state = await sql(`SELECT draw_count, score_due_at > now() AS window_reset FROM public.brackets WHERE id = '${bracket2}'`)
const b2reports = await sql(`SELECT count(*)::int AS n FROM public.score_reports WHERE bracket_id = '${bracket2}'`)
const rematchFired = (b2state[0]?.draw_count ?? 0) >= 1 && b2reports[0].n === 0 && b2state[0]?.window_reset
console.log(`\nrematch check: draw_count=${b2state[0]?.draw_count} reports=${b2reports[0].n} window_reset=${b2state[0]?.window_reset} -> ${rematchFired ? 'FIRED ✓' : 'NOT FIRED ✗'}`)
const inviteState = await sql(`SELECT reminder_2h_sent, invite_sender_id IS NOT NULL AS sender_chosen FROM public.scheduled_matches WHERE match_id = '${bracket1}'`)
console.log(`invite check: reminder_2h_sent=${inviteState[0]?.reminder_2h_sent} sender_chosen=${inviteState[0]?.sender_chosen}`)

console.log('\nExpected emails to player-one@example.com + player-two@example.com:')
console.log('  - 2h reminder (both)')
console.log('  - invite-sender (one) + invite-receiver (other)')
console.log('  - rematch (both)')
