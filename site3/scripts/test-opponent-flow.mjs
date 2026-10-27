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

// Clean up previous test data
await sql(`DELETE FROM public.admin_reviews WHERE match_id IN (SELECT id FROM public.brackets WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name = 'EA FC Season 1 — Test'))`)
await sql(`DELETE FROM public.score_reports WHERE bracket_id IN (SELECT id FROM public.brackets WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name = 'EA FC Season 1 — Test'))`)
await sql(`DELETE FROM public.scheduled_matches WHERE match_id IN (SELECT id FROM public.brackets WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name = 'EA FC Season 1 — Test'))`)
await sql(`DELETE FROM public.match_tokens WHERE match_id IN (SELECT id FROM public.brackets WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name = 'EA FC Season 1 — Test'))`)
await sql(`DELETE FROM public.match_availability WHERE match_id IN (SELECT id FROM public.brackets WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name = 'EA FC Season 1 — Test'))`)
await sql(`DELETE FROM public.brackets WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name = 'EA FC Season 1 — Test')`)
await sql(`DELETE FROM public.rounds WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name = 'EA FC Season 1 — Test')`)
await sql(`DELETE FROM public.match_tokens WHERE player_id IN (SELECT id FROM public.participants WHERE email IN ('${TEST_EMAILS.join("','")}'))`)
await sql(`DELETE FROM public.player_tokens WHERE player_id IN (SELECT id FROM public.players WHERE email IN ('${TEST_EMAILS.join("','")}'))`)
await sql(`DELETE FROM public.waitlist_entries WHERE player_id IN (SELECT id FROM public.players WHERE email IN ('${TEST_EMAILS.join("','")}'))`)
await sql(`DELETE FROM public.players WHERE email IN ('${TEST_EMAILS.join("','")}')`)
await sql(`DELETE FROM public.participants WHERE email IN ('${TEST_EMAILS.join("','")}')`)
await sql(`DELETE FROM public.tournaments WHERE name = 'EA FC Season 1 — Test'`)
console.log('✓ previous test data cleared')

// Insert test tournament
const tournaments = await sql(`
  INSERT INTO public.tournaments (name, game, max_participants, status)
  VALUES ('EA FC Season 1 — Test', 'EA FC 26', 32, 'active')
  RETURNING id
`)
const tournamentId = tournaments[0].id
console.log(`✓ test tournament: ${tournamentId}`)

// Seed rounds
await sql(`
  INSERT INTO public.rounds (tournament_id, round_number, round_name, scheduling_deadline, play_window_start, play_window_end)
  VALUES (
    '${tournamentId}', 1, 'Round 1',
    now() + interval '12 hours',
    now() + interval '1 day',
    now() + interval '3 days'
  )
`)
await sql(`
  INSERT INTO public.rounds (tournament_id, round_number, round_name, scheduling_deadline, play_window_start, play_window_end)
  VALUES (
    '${tournamentId}', 2, 'Final',
    now() + interval '4 days',
    now() + interval '5 days',
    now() + interval '5 days 2 hours'
  )
`)
console.log('✓ rounds 1 + 2 (final) seeded')

// Insert 4 test participants
const pA = await sql(`INSERT INTO public.participants (name, email, psn_id, status) VALUES ('Player One', 'player-one@example.com', 'PlayerOne_Test', 'bracket') RETURNING id`)
const pB = await sql(`INSERT INTO public.participants (name, email, psn_id, status) VALUES ('Test Opponent', 'player-two@example.com', 'OpponentPSN_Test', 'bracket') RETURNING id`)
const pC = await sql(`INSERT INTO public.participants (name, email, psn_id, status) VALUES ('H And H', 'player-three@example.com', 'HAndH_PSN', 'bracket') RETURNING id`)
const pD = await sql(`INSERT INTO public.participants (name, email, psn_id, status) VALUES ('Ait', 'player-four@example.com', 'AitRewind_PSN', 'bracket') RETURNING id`)

const [playerAId, playerBId, playerCId, playerDId] = [pA[0].id, pB[0].id, pC[0].id, pD[0].id]
console.log(`✓ participants: ${playerAId}, ${playerBId}, ${playerCId}, ${playerDId}`)

// Insert 2 bracket matches
const bracketAB = await sql(`INSERT INTO public.brackets (tournament_id, round_number, position, participant_a_id, participant_b_id, status) VALUES ('${tournamentId}', 1, 1, '${playerAId}', '${playerBId}', 'pending') RETURNING id`)
const bracketCD = await sql(`INSERT INTO public.brackets (tournament_id, round_number, position, participant_a_id, participant_b_id, status) VALUES ('${tournamentId}', 1, 2, '${playerCId}', '${playerDId}', 'pending') RETURNING id`)

const matchIdAB = bracketAB[0].id
const matchIdCD = bracketCD[0].id
console.log(`✓ bracket matches: ${matchIdAB}, ${matchIdCD}`)

// Send opponent emails for both matches
for (const matchId of [matchIdAB, matchIdCD]) {
  const res = await fetch(`${BASE_URL}/api/emails/opponent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': env.INTERNAL_API_SECRET },
    body: JSON.stringify({ matchId }),
  })
  const result = await res.json()
  if (!result.ok) {
    console.error(`Email API failed for match ${matchId}:`, result)
    process.exit(1)
  }
  console.log(`✓ opponent emails sent for match ${matchId}`)
}

console.log(`\nEmails sent to:`)
console.log(`  Match 1: player-one@example.com vs player-two@example.com`)
console.log(`  Match 2: player-three@example.com vs player-four@example.com`)
console.log(`Availability links at: ${BASE_URL}/availability/[token]`)
