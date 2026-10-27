import { sql } from './supabase'

const S1_TOURNAMENT_ID = 'cc76b2fc-32db-4760-b7a2-83c608a03964'

export type RoundFact = {
  round: number
  goalsScored: number
  goalsConceded: number
  streamLink: string | null
  opponentPsn: string | null
  status: string
}

export type SeasonStats = {
  seasonId: string
  seasonName: string
  game: string
  matchesPlayed: number
  goalsScored: number
  goalsConceded: number
  roundReached: number
  currentRound: number
  rounds: RoundFact[]
}

export type Comm = {
  channel: 'email'
  direction: string
  subject: string | null
  type: string | null
  url: string | null
  at: string
  bodyHtml: string | null
}

export type Player = {
  id: string
  name: string
  email: string
  psnId: string | null
  discord: string | null
  phone: string | null
  platformType: string | null
  marketingOptIn: boolean
  addedToDiscord: boolean
  streamUrl: string | null
  instagram: string | null
  seasons: SeasonStats[]
  comms: Comm[]
}

type ParticipantRow = {
  id: string
  name: string
  email: string
  psn_id: string | null
  discord_id: string | null
  mobile: string | null
  platform_type: string | null
  marketing_opt_in: boolean | null
  added_to_discord: boolean | null
  stream_url: string | null
  instagram: string | null
}

type BracketRow = {
  id: string
  tournament_id: string
  round_number: number
  participant_a_id: string
  participant_b_id: string
  winner_id: string | null
  status: string
  score_a: number | null
  score_b: number | null
  stream_url_a: string | null
  stream_url_b: string | null
  completed_at: string | null
}

type EmailLogRow = {
  id: string
  participant_id: string
  email_type: string | null
  direction: string
  from_email: string | null
  subject: string | null
  email_url: string | null
  sent_at: string | null
  received_at: string | null
  status: string
  body_html: string | null
}

type ScoreReportRow = {
  bracket_id: string
  reporter_id: string
  stream_url: string | null
}

type TournamentRow = {
  id: string
  name: string
  game: string
  status: string
}

export async function getPlayersDashboardData(): Promise<Player[]> {
  const participants = await sql<ParticipantRow>(
    'SELECT id, name, email, psn_id, discord_id, mobile, platform_type, marketing_opt_in, added_to_discord, stream_url, instagram FROM public.participants'
  )

  const brackets = await sql<BracketRow>(
    `SELECT id, tournament_id, round_number, participant_a_id, participant_b_id, winner_id, status, score_a, score_b, stream_url_a, stream_url_b, completed_at
     FROM public.brackets
     WHERE tournament_id = $1
     ORDER BY round_number ASC`,
    [S1_TOURNAMENT_ID]
  )

  const emailLogs = await sql<EmailLogRow>(
    'SELECT id, participant_id, email_type, direction, from_email, subject, email_url, sent_at, received_at, status, body_html FROM public.email_logs'
  )

  const tournaments = await sql<TournamentRow>(
    'SELECT id, name, game, status FROM public.tournaments WHERE id = $1',
    [S1_TOURNAMENT_ID]
  )

  const scoreReports = await sql<ScoreReportRow>(
    `SELECT sr.bracket_id, sr.reporter_id, sr.stream_url
     FROM public.score_reports sr
     JOIN public.brackets b ON b.id = sr.bracket_id
     WHERE b.tournament_id = $1`,
    [S1_TOURNAMENT_ID]
  )

  const tournament = tournaments[0]
  const participantMap = new Map(participants.map((p) => [p.id, p]))
  const emailsByParticipant = new Map<string, EmailLogRow[]>()
  const streamByReport = new Map<string, string | null>()

  for (const r of scoreReports) {
    streamByReport.set(`${r.bracket_id}:${r.reporter_id}`, r.stream_url)
  }

  for (const log of emailLogs) {
    if (!emailsByParticipant.has(log.participant_id)) {
      emailsByParticipant.set(log.participant_id, [])
    }
    emailsByParticipant.get(log.participant_id)!.push(log)
  }

  const bracketsByParticipant = new Map<string, BracketRow[]>()
  for (const bracket of brackets) {
    if (!bracketsByParticipant.has(bracket.participant_a_id)) {
      bracketsByParticipant.set(bracket.participant_a_id, [])
    }
    bracketsByParticipant.get(bracket.participant_a_id)!.push(bracket)

    if (!bracketsByParticipant.has(bracket.participant_b_id)) {
      bracketsByParticipant.set(bracket.participant_b_id, [])
    }
    bracketsByParticipant.get(bracket.participant_b_id)!.push(bracket)
  }

  const players: Player[] = participants.map((p) => {
    const playerBrackets = bracketsByParticipant.get(p.id) ?? []
    const logs = emailsByParticipant.get(p.id) ?? []

    // Calculate stats
    let matchesPlayed = 0
    let goalsScored = 0
    let goalsConceded = 0
    let roundReached = 0
    let currentRound = 0

    const roundFacts: RoundFact[] = []

    for (const bracket of playerBrackets) {
      const isA = bracket.participant_a_id === p.id
      const theirScore = (isA ? bracket.score_a : bracket.score_b) ?? 0
      const concededScore = (isA ? bracket.score_b : bracket.score_a) ?? 0
      const theirStream = isA ? bracket.stream_url_a : bracket.stream_url_b
      const opponentId = isA ? bracket.participant_b_id : bracket.participant_a_id
      const opponentPsn = participantMap.get(opponentId)?.psn_id ?? null

      if (bracket.status === 'completed') {
        matchesPlayed++
        goalsScored += theirScore
        goalsConceded += concededScore
      }

      roundReached = Math.max(roundReached, bracket.round_number)

      if (bracket.status !== 'completed') {
        currentRound = Math.max(currentRound, bracket.round_number)
      }

      roundFacts.push({
        round: bracket.round_number,
        goalsScored: theirScore,
        goalsConceded: concededScore,
        streamLink: streamByReport.get(`${bracket.id}:${p.id}`) ?? theirStream,
        opponentPsn,
        status: bracket.status,
      })
    }

    if (currentRound === 0) {
      currentRound = roundReached
    }

    roundFacts.sort((a, b) => a.round - b.round)

    const comms: Comm[] = logs.map((log) => ({
      channel: 'email',
      direction: log.direction,
      subject: log.subject,
      type: log.email_type,
      url: log.email_url,
      at: log.received_at ?? log.sent_at ?? '',
      bodyHtml: log.body_html,
    }))

    comms.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    const seasons: SeasonStats[] = []
    if (tournament) {
      seasons.push({
        seasonId: tournament.id,
        seasonName: tournament.name,
        game: tournament.game,
        matchesPlayed,
        goalsScored,
        goalsConceded,
        roundReached,
        currentRound,
        rounds: roundFacts,
      })
    }

    return {
      id: p.id,
      name: p.name,
      email: p.email,
      psnId: p.psn_id,
      discord: p.discord_id,
      phone: p.mobile,
      platformType: p.platform_type,
      marketingOptIn: Boolean(p.marketing_opt_in),
      addedToDiscord: Boolean(p.added_to_discord),
      streamUrl: p.stream_url,
      instagram: p.instagram,
      seasons,
      comms,
    }
  })

  players.sort((a, b) => a.name.localeCompare(b.name))

  return players
}
