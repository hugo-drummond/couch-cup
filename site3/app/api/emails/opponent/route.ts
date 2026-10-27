import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { createMatchToken } from '@/lib/tokens'
import { sendOpponentEmail } from '@/lib/email'

interface ParticipantRow {
  id: string
  name: string
  email: string
  psn_id: string
  youtube_url: string | null
}

interface BracketRow {
  participant_a_id: string
  participant_b_id: string
  round_number: number
}

interface RoundRow {
  round_name: string
  play_window_start: string
  play_window_end: string
  scheduling_deadline: string
  tournament_id: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  })
}

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
  })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { matchId } = await req.json()
  if (!matchId) return NextResponse.json({ error: 'missing_match_id' }, { status: 400 })

  const brackets = await sql<BracketRow>(
    `SELECT participant_a_id, participant_b_id, round_number FROM public.brackets WHERE id = $1`,
    [matchId]
  )
  if (!brackets.length) return NextResponse.json({ error: 'match_not_found' }, { status: 404 })

  const { participant_a_id, participant_b_id, round_number } = brackets[0]

  const participants = await sql<ParticipantRow>(
    `SELECT pa.id, pa.name, pa.email, pa.psn_id,
            (SELECT pl.youtube_url FROM public.players pl WHERE lower(pl.email) = lower(pa.email) LIMIT 1) AS youtube_url
     FROM public.participants pa WHERE pa.id IN ($1, $2)`,
    [participant_a_id, participant_b_id]
  )
  if (participants.length < 2) return NextResponse.json({ error: 'participants_not_found' }, { status: 404 })

  const playerA = participants.find(p => p.id === participant_a_id)!
  const playerB = participants.find(p => p.id === participant_b_id)!

  // Get round info from the tournament linked to this bracket
  const rounds = await sql<RoundRow>(`
    SELECT r.round_name, r.play_window_start, r.play_window_end, r.scheduling_deadline, r.tournament_id
    FROM public.rounds r
    JOIN public.brackets b ON b.tournament_id = r.tournament_id
    WHERE b.id = $1 AND r.round_number = $2
  `, [matchId, round_number])

  if (!rounds.length) return NextResponse.json({ error: 'round_not_found' }, { status: 404 })

  const round = rounds[0]
  const playWindow = formatDate(round.play_window_end)
  const schedulingDeadline = formatDeadline(round.scheduling_deadline)

  const tokenA = await createMatchToken(playerA.id, matchId, 'scheduling', 24)
  const tokenB = await createMatchToken(playerB.id, matchId, 'scheduling', 24)

  await Promise.all([
    sendOpponentEmail(
      playerA.email,
      playerA.name.split(' ')[0],
      playerB.psn_id,
      round.round_name,
      playWindow,
      schedulingDeadline,
      tokenA,
      !!playerA.youtube_url
    ),
    sendOpponentEmail(
      playerB.email,
      playerB.name.split(' ')[0],
      playerA.psn_id,
      round.round_name,
      playWindow,
      schedulingDeadline,
      tokenB,
      !!playerB.youtube_url
    ),
  ])

  return NextResponse.json({ ok: true, matchId })
}
