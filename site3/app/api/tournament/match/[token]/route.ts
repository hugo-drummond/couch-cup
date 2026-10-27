import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { detectPlatform } from '@/lib/channel'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const rows = await sql<{
    token: string
    player_id: string
    match_id: string
    type: string
    expires_at: string
    used_at: string | null
    player_name: string
    opponent_psn: string
    match_status: string
    scheduled_at: string | null
    play_window_start: string | null
    play_window_end: string | null
    round_name: string | null
    youtube_url: string | null
  }>(`
    SELECT
      mt.token,
      mt.player_id,
      mt.match_id,
      mt.type,
      mt.expires_at,
      mt.used_at,
      p.name AS player_name,
      opp.psn_id AS opponent_psn,
      b.status AS match_status,
      sm.scheduled_at,
      r.play_window_start,
      r.play_window_end,
      r.round_name,
      (SELECT pl.youtube_url FROM public.players pl WHERE lower(pl.email) = lower(p.email) LIMIT 1) AS youtube_url
    FROM public.match_tokens mt
    JOIN public.participants p ON p.id = mt.player_id
    JOIN public.brackets b ON b.id = mt.match_id
    JOIN public.participants opp ON opp.id = CASE
      WHEN b.participant_a_id = mt.player_id THEN b.participant_b_id
      ELSE b.participant_a_id
    END
    LEFT JOIN public.scheduled_matches sm ON sm.match_id = mt.match_id
    LEFT JOIN public.rounds r ON r.tournament_id = b.tournament_id AND r.round_number = b.round_number
    WHERE mt.token = $1
  `, [token])

  if (!rows.length) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  }

  const row = rows[0]

  // If token already used, return score data for read-only view
  if (row.used_at) {
    const scoreData = await sql<{
      score_reporter: number
      score_opponent: number
    }>(
      `SELECT score_reporter, score_opponent FROM public.score_reports
       WHERE bracket_id = $1 AND reporter_id = $2 LIMIT 1`,
      [row.match_id, row.player_id]
    )

    if (scoreData.length) {
      const sr = scoreData[0]
      return NextResponse.json({
        type: 'submission',
        status: 'submitted',
        playerName: row.player_name,
        opponentPsn: row.opponent_psn,
        scoreReporter: sr.score_reporter,
        scoreOpponent: sr.score_opponent,
        matchId: row.match_id,
        scheduledAt: row.scheduled_at,
      })
    }
    return NextResponse.json({ error: 'already_used' }, { status: 410 })
  }

  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  return NextResponse.json({
    type: row.type,
    playerName: row.player_name,
    opponentPsn: row.opponent_psn,
    matchId: row.match_id,
    matchStatus: row.match_status,
    scheduledAt: row.scheduled_at,
    expiresAt: row.expires_at,
    playWindowStart: row.play_window_start,
    playWindowEnd: row.play_window_end,
    roundName: row.round_name,
    hasYoutube: !!row.youtube_url,
    channelPlatform: detectPlatform(row.youtube_url),
  })
}
