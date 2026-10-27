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

// Clean up demo data
await sql(`DELETE FROM public.waitlist_entries`)
await sql(`DELETE FROM public.tournaments`)
console.log('✓ demo data cleared')

// Drop old waitlist_entries (FK pointed to participants)
await sql(`DROP TABLE IF EXISTS public.waitlist_entries`)
console.log('✓ old waitlist_entries dropped')

// Create players table
await sql(`
  CREATE TABLE IF NOT EXISTS public.players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    psn_id text NOT NULL UNIQUE,
    discord_id text,
    mobile text,
    date_of_birth date,
    country text,
    is_eligible boolean NOT NULL DEFAULT true,
    marketing_opt_in boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`)
console.log('✓ players table created')

// Recreate waitlist_entries with FK to players
await sql(`
  CREATE TABLE IF NOT EXISTS public.waitlist_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
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
console.log('✓ waitlist_entries recreated (FK → players)')

// Create player_tokens table (accept/decline and future player-level tokens)
await sql(`
  CREATE TABLE IF NOT EXISTS public.player_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE,
    player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('acceptance')),
    expires_at timestamptz NOT NULL,
    used_at timestamptz
  )
`)
console.log('✓ player_tokens table created')

console.log('\nSchema migrations complete. participants table untouched.')
