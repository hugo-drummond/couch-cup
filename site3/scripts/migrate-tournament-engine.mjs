import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, '..', '.env.local')
const env = {}
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (match) env[match[1].trim()] = match[2].replace(/\\n$/, '').trim()
})

const SUPABASE_URL = 'https://api.supabase.com/v1/projects/rnoavvjxiozlyrulffal/database/query'
const SUPA_TOKEN = env.SUPABASE_MANAGEMENT_TOKEN

async function sql(query) {
  const res = await fetch(SUPABASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (!res.ok || data?.message) throw new Error(data?.message ?? `HTTP ${res.status}`)
  return data
}

async function run() {
  console.log('Running tournament engine migrations...')

  await sql(`
    ALTER TABLE public.brackets
    ADD COLUMN IF NOT EXISTS bye_recipient_id uuid REFERENCES public.participants(id)
  `)
  console.log('✓ brackets.bye_recipient_id')

  await sql(`
    CREATE TABLE IF NOT EXISTS public.match_availability (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id uuid NOT NULL REFERENCES public.brackets(id) ON DELETE CASCADE,
      player_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
      date date NOT NULL,
      start_time time NOT NULL,
      end_time time NOT NULL,
      submitted_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  console.log('✓ match_availability')

  await sql(`
    CREATE TABLE IF NOT EXISTS public.scheduled_matches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id uuid NOT NULL UNIQUE REFERENCES public.brackets(id) ON DELETE CASCADE,
      scheduled_at timestamptz NOT NULL,
      confirmed_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  console.log('✓ scheduled_matches')

  await sql(`
    CREATE TABLE IF NOT EXISTS public.match_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token text NOT NULL UNIQUE,
      player_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
      match_id uuid NOT NULL REFERENCES public.brackets(id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('scheduling', 'submission', 'proposal_accept', 'proposal_decline')),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )
  `)
  console.log('✓ match_tokens')

  await sql(`
    CREATE OR REPLACE VIEW public.round_losers AS
    SELECT
      p.id,
      p.name,
      p.email,
      b.tournament_id,
      b.round_number,
      COALESCE(SUM(
        CASE WHEN b.participant_a_id = p.id THEN b.score_a
             WHEN b.participant_b_id = p.id THEN b.score_b
             ELSE 0 END
      ), 0) AS total_goals
    FROM public.participants p
    JOIN public.brackets b
      ON (b.participant_a_id = p.id OR b.participant_b_id = p.id)
      AND b.winner_id IS NOT NULL
      AND b.winner_id != p.id
    GROUP BY p.id, p.name, p.email, b.tournament_id, b.round_number
    ORDER BY total_goals DESC
  `)
  console.log('✓ round_losers view')

  console.log('\nAll migrations complete.')
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1) })
