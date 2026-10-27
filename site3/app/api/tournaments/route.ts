import { NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'

// Cache ~60s — same reasoning as the bracket route: rare changes, rate-limited
// Supabase management API.
export const revalidate = 60

export type TournamentSummary = {
  id: string
  name: string
  slug: string | null
  game: string | null
  status: string
  prize: string | null
  entry: string | null
  format: string | null
  stream_url: string | null
  image_url: string | null
  max_participants: number
  started_at: string | null
  ended_at: string | null
  player_count: number
  winner_psn: string | null
}

export type TournamentsPayload = {
  current: TournamentSummary[]
  past: TournamentSummary[]
}

const EMPTY: TournamentsPayload = { current: [], past: [] }

export async function GET() {
  try {
    const rows = await sql<TournamentSummary>(`
      SELECT
        t.id, t.name, t.slug, t.game, t.status,
        t.prize, t.entry, t.format, t.stream_url, t.image_url,
        t.max_participants, t.started_at, t.ended_at,
        (
          SELECT count(DISTINCT pid)::int FROM (
            SELECT participant_a_id AS pid FROM brackets WHERE tournament_id = t.id
            UNION
            SELECT participant_b_id FROM brackets WHERE tournament_id = t.id
          ) x WHERE pid IS NOT NULL
        ) AS player_count,
        (
          SELECT pw.psn_id FROM brackets b
          JOIN participants pw ON pw.id = b.winner_id
          WHERE b.tournament_id = t.id AND b.winner_id IS NOT NULL
          ORDER BY b.round_number DESC LIMIT 1
        ) AS winner_psn
      FROM tournaments t
      WHERE t.status <> 'draft'
      ORDER BY t.created_at DESC
    `)
    return NextResponse.json({
      current: rows.filter((r) => r.status === 'registration' || r.status === 'active'),
      past: rows.filter((r) => r.status === 'completed'),
    })
  } catch {
    // Never 500 the homepage; uncacheable so the empty result isn't kept for 60s.
    return NextResponse.json(EMPTY, { headers: { 'Cache-Control': 'no-store' } })
  }
}
