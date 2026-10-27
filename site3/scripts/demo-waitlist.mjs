import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = {}
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (match) env[match[1].trim()] = match[2].replace(/\\n$/, '').trim()
})

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

// Create waitlist_entries table
await sql(`
  CREATE TABLE IF NOT EXISTS public.waitlist_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
    tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'waitlist'
      CHECK (status IN ('waitlist','selected','accepted','declined','bracket','eliminated','winner','flagged')),
    final_place text,
    signup_timestamp timestamptz NOT NULL DEFAULT now(),
    selected_at timestamptz,
    accepted_at timestamptz,
    forfeit_advances integer NOT NULL DEFAULT 0,
    flagged_for_review boolean NOT NULL DEFAULT false,
    UNIQUE(player_id, tournament_id)
  )
`)
console.log('✓ waitlist_entries table created')

// Insert EA FC Season 1 tournament
const tourney = await sql(`
  INSERT INTO public.tournaments (name, game, max_participants, status)
  VALUES ('EA FC Season 1', 'EA FC 26', 32, 'pending')
  RETURNING id
`)
const tournamentId = tourney[0].id
console.log(`✓ tournament inserted: ${tournamentId}`)

// Get 3 real participants to use as demo rows
const players = await sql(`SELECT id, name FROM public.participants LIMIT 3`)

// Insert demo waitlist entries
await sql(`
  INSERT INTO public.waitlist_entries (player_id, tournament_id, status, final_place, selected_at, accepted_at)
  VALUES
    ('${players[0].id}', '${tournamentId}', 'winner',    '1st',  '2026-06-10', '2026-06-11'),
    ('${players[1].id}', '${tournamentId}', 'eliminated', null,  '2026-06-10', '2026-06-11'),
    ('${players[2].id}', '${tournamentId}', 'waitlist',   null,   null,         null)
`)
console.log('✓ demo rows inserted')

// Show the table
const rows = await sql(`
  SELECT
    p.name,
    t.name AS tournament,
    t.game,
    we.status,
    we.final_place,
    we.signup_timestamp::date AS signed_up,
    we.selected_at::date AS selected,
    we.accepted_at::date AS accepted
  FROM public.waitlist_entries we
  JOIN public.participants p ON p.id = we.player_id
  JOIN public.tournaments t ON t.id = we.tournament_id
  ORDER BY we.signup_timestamp
`)

console.log('\nwaitlist_entries preview:')
console.table(rows)
