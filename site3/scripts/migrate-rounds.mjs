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

await sql(`
  CREATE TABLE IF NOT EXISTS public.rounds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    round_number integer NOT NULL,
    round_name text NOT NULL,
    scheduling_deadline timestamptz NOT NULL,
    play_window_start timestamptz NOT NULL,
    play_window_end timestamptz NOT NULL,
    notification_sent_at timestamptz,
    UNIQUE(tournament_id, round_number)
  )
`)
console.log('✓ rounds table created')

// Add stream_url to score_reports
await sql(`ALTER TABLE public.score_reports ADD COLUMN IF NOT EXISTS stream_url text`)
console.log('✓ score_reports.stream_url added')

// Seed EA FC Season 1 rounds — get tournament id first
const tournaments = await sql(`SELECT id FROM public.tournaments WHERE name = 'EA FC Season 1' LIMIT 1`)

if (!tournaments.length) {
  console.log('⚠ No EA FC Season 1 tournament found — skipping seed. Create the tournament first.')
  process.exit(0)
}

const tid = tournaments[0].id

await sql(`
  INSERT INTO public.rounds (tournament_id, round_number, round_name, scheduling_deadline, play_window_start, play_window_end)
  VALUES
    ('${tid}', 1, 'Round 1',       '2026-06-18 23:59:00+02', '2026-06-19 00:00:00+02', '2026-06-21 23:59:00+02'),
    ('${tid}', 2, 'Round 2',       '2026-06-22 23:59:00+02', '2026-06-23 00:00:00+02', '2026-06-24 23:59:00+02'),
    ('${tid}', 3, 'Quarter-finals','2026-06-25 23:59:00+02', '2026-06-26 00:00:00+02', '2026-06-27 23:59:00+02'),
    ('${tid}', 4, 'Semi-finals',   '2026-06-28 23:59:00+02', '2026-06-29 00:00:00+02', '2026-06-30 23:59:00+02'),
    ('${tid}', 5, 'Final',         '2026-07-01 23:59:00+02', '2026-07-03 19:00:00+02', '2026-07-03 19:00:00+02')
  ON CONFLICT (tournament_id, round_number) DO NOTHING
`)
console.log('✓ rounds seeded for EA FC Season 1')

const rows = await sql(`SELECT round_number, round_name, scheduling_deadline::date AS deadline, play_window_start::date AS starts FROM public.rounds WHERE tournament_id = '${tid}' ORDER BY round_number`)
console.table(rows)
