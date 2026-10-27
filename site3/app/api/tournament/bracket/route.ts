import { NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import {
  BracketData,
  BracketPlayer,
  BracketRow,
  fromRealRows,
  project,
  r16RoundNumber,
} from '@/lib/bracket'

// Cache the response ~60s (stale-while-revalidate). The data changes rarely,
// and this stops every visit hammering the rate-limited Supabase management API.
export const revalidate = 60

const EMPTY: BracketData = { tournamentName: '', rounds: [] }

export async function GET(request: Request) {
  try {
  const tournamentId = new URL(request.url).searchParams.get('tournamentId')
  const tRows = tournamentId
    ? await sql<{ id: string; name: string; max_participants: number }>(`
        SELECT id, name, max_participants FROM tournaments
        WHERE id = $1 AND status IN ('active', 'completed') LIMIT 1
      `, [tournamentId])
    : await sql<{ id: string; name: string; max_participants: number }>(`
        SELECT id, name, max_participants FROM tournaments
        WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
      `)
  if (!tRows.length) return NextResponse.json(EMPTY)
  const t = tRows[0]
  const n = Math.round(Math.log2(t.max_participants))
  const r16 = r16RoundNumber(t.max_participants)

  // 1. Prefer real Round-of-16+ rows once the cron has generated them.
  const rows = await sql<BracketRow>(`
    SELECT
      b.id, b.round_number, b.position, b.status,
      b.participant_a_id, b.participant_b_id, b.winner_id,
      b.score_a, b.score_b, b.scheduled_at, b.forfeit_reason,
      b.stream_url_a, b.stream_url_b,
      pa.name AS a_name, pa.psn_id AS a_psn,
      pb.name AS b_name, pb.psn_id AS b_psn
    FROM brackets b
    LEFT JOIN participants pa ON pa.id = b.participant_a_id
    LEFT JOIN participants pb ON pb.id = b.participant_b_id
    WHERE b.tournament_id = $1 AND b.round_number >= $2
    ORDER BY b.round_number, b.position
  `, [t.id, r16])
  if (rows.length) {
    return NextResponse.json({ tournamentName: t.name, rounds: fromRealRows(rows) })
  }

  // 2. Otherwise project the bracket from the latest played round's winners,
  //    so Round-of-16 qualifiers show now with TBC for undecided feeders.
  const latestRows = await sql<{ rn: number }>(
    `SELECT MAX(round_number) AS rn FROM brackets WHERE tournament_id = $1`,
    [t.id]
  )
  const latest = latestRows[0]?.rn
  if (!latest || latest >= r16) return NextResponse.json(EMPTY)

  const feed = await sql<{ position: number; w_name: string | null; w_psn: string | null }>(`
    SELECT b.position, pw.name AS w_name, pw.psn_id AS w_psn
    FROM brackets b
    LEFT JOIN participants pw ON pw.id = b.winner_id
    WHERE b.tournament_id = $1 AND b.round_number = $2
    ORDER BY b.position
  `, [t.id, latest])
  if (!feed.length) return NextResponse.json(EMPTY)

  const feeders: (BracketPlayer | null)[] = feed.map((f) =>
    f.w_psn || f.w_name ? { name: f.w_name, psn: f.w_psn } : null
  )

  return NextResponse.json({ tournamentName: t.name, rounds: project(feeders, latest + 1, n, r16) })
  } catch {
    // Never 500 the homepage: on a transient management-API error, return empty.
    // With ISR (revalidate=60) Next keeps serving the last good cached response.
    // On error, make response uncacheable so empty result doesn't get cached for 60s.
    return NextResponse.json(EMPTY, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
