// Shared types + pure helpers for the public tournament bracket.
// Used by the API route (server) and the bracket component (client).

export type MatchState = 'tbd' | 'scheduled' | 'live' | 'completed' | 'walkover'

export interface BracketPlayer {
  name: string | null
  psn: string | null
}

export interface BracketMatch {
  id: string
  position: number
  state: MatchState
  a: BracketPlayer | null // null = slot awaiting a prior winner (TBD)
  b: BracketPlayer | null
  scoreA: number | null
  scoreB: number | null
  winner: 'a' | 'b' | null
  scheduledAt: string | null // ISO UTC
  streamUrl: string | null
  forfeit: boolean
  bye: boolean // auto-advance (no opponent) vs a real walkover
}

export interface BracketRound {
  roundNumber: number
  label: string
  matches: BracketMatch[]
}

export interface BracketData {
  tournamentName: string
  rounds: BracketRound[] // only Round-of-16 onward; empty until reached
}

export const WATCH_FALLBACK = 'https://www.youtube.com/@couchcupp'

// Round of 16 is the first round with <= 16 players competing.
// In a bracket of `maxPlayers`, round k has 2^(n - k + 1) players where n = log2(maxPlayers).
// 16 players => round_number = n - 3 (min 1).
export function r16RoundNumber(maxPlayers: number): number {
  const n = Math.round(Math.log2(maxPlayers))
  return Math.max(1, n - 3)
}

// Friendly label from how many matches the round contains.
export function roundLabel(matchCount: number): string {
  switch (matchCount) {
    case 8:
      return 'Round of 16'
    case 4:
      return 'Quarter-Finals'
    case 2:
      return 'Semi-Finals'
    case 1:
      return 'Final'
    default:
      return `Round of ${matchCount * 2}`
  }
}

// Format a UTC ISO time for South African display (SAST = UTC+2).
export function formatSAST(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d
    .toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(',', '')
}

/* ── bracket construction (pure; shared by the API route + tests) ─────────── */

// Raw DB shape for a brackets row joined with both participants' name/psn.
export interface BracketRow {
  id: string
  round_number: number
  position: number
  status: string | null
  participant_a_id: string | null
  participant_b_id: string | null
  winner_id: string | null
  score_a: number | null
  score_b: number | null
  scheduled_at: string | null
  forfeit_reason: string | null
  stream_url_a: string | null
  stream_url_b: string | null
  a_name: string | null
  a_psn: string | null
  b_name: string | null
  b_psn: string | null
}

const LIVE_STATUSES = new Set(['active', 'live', 'in_progress', 'playing'])

export function deriveState(r: BracketRow): { state: MatchState; winner: 'a' | 'b' | null } {
  const hasA = !!r.participant_a_id
  const hasB = !!r.participant_b_id
  if (r.winner_id) {
    const winner = r.winner_id === r.participant_a_id ? 'a' : 'b'
    return { state: r.forfeit_reason ? 'walkover' : 'completed', winner }
  }
  if (!hasA || !hasB) return { state: 'tbd', winner: null }
  if (LIVE_STATUSES.has((r.status ?? '').toLowerCase())) return { state: 'live', winner: null }
  return { state: 'scheduled', winner: null }
}

// Build rounds from real brackets rows (Round of 16 onward).
export function fromRealRows(rows: BracketRow[]): BracketRound[] {
  const byRound = new Map<number, BracketMatch[]>()
  for (const r of rows) {
    const { state, winner } = deriveState(r)
    const match: BracketMatch = {
      id: r.id,
      position: r.position,
      state,
      a: r.participant_a_id ? { name: r.a_name, psn: r.a_psn } : null,
      b: r.participant_b_id ? { name: r.b_name, psn: r.b_psn } : null,
      scoreA: r.score_a,
      scoreB: r.score_b,
      winner,
      scheduledAt: r.scheduled_at,
      streamUrl: r.stream_url_a ?? r.stream_url_b ?? null,
      forfeit: !!r.forfeit_reason,
      bye: !!r.winner_id && (!r.participant_a_id || !r.participant_b_id),
    }
    const list = byRound.get(r.round_number) ?? []
    list.push(match)
    byRound.set(r.round_number, list)
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, matches]) => ({
      roundNumber,
      label: roundLabel(matches.length),
      matches: matches.sort((x, y) => x.position - y.position),
    }))
}

// Project rounds forward from a list of feeder winners (null = TBC).
// Mirrors generateNextRound: winners ordered by position, paired consecutively.
export function project(
  feeders: (BracketPlayer | null)[],
  fromRound: number,
  n: number,
  r16: number
): BracketRound[] {
  const out: BracketRound[] = []
  let prev = feeders
  for (let r = fromRound; r <= n; r++) {
    const count = Math.max(1, prev.length >> 1)
    const matches: BracketMatch[] = []
    for (let j = 0; j < count; j++) {
      const a = prev[2 * j] ?? null
      const b = prev[2 * j + 1] ?? null
      matches.push({
        id: `proj-${r}-${j}`,
        position: j + 1,
        state: a && b ? 'scheduled' : 'tbd',
        a,
        b,
        scoreA: null,
        scoreB: null,
        winner: null,
        scheduledAt: null,
        streamUrl: null,
        forfeit: false,
        bye: false,
      })
    }
    if (r >= r16) out.push({ roundNumber: r, label: roundLabel(count), matches })
    prev = new Array(count).fill(null)
  }
  return out
}
