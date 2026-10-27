import { sql } from './supabase'

export type Entrant = {
  id: string
  source: 'waitlist' | 'bracket'
  name: string
  gamingId: string | null
  email: string | null
  status: string | null
  platform: string | null
  country: string | null
  marketingOptIn: boolean
  partnerRef: string | null
  signupAt: string | null
}

export type TournamentAdmin = {
  id: string
  name: string
  slug: string | null
  game: string | null
  status: string
  format: string | null
  entry: string | null
  prize: string | null
  streamUrl: string | null
  imageUrl: string | null
  maxParticipants: number | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string | null
  entrantCount: number
  entrants: Entrant[]
}

type TournamentRow = {
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
  max_participants: number | null
  started_at: string | null
  ended_at: string | null
  created_at: string | null
}

type WaitlistRow = {
  tournament_id: string
  status: string | null
  w_gaming_id: string | null
  partner_ref: string | null
  signup_timestamp: string | null
  player_id: string
  name: string | null
  email: string | null
  gaming_id: string | null
  platform: string | null
  country: string | null
  marketing_opt_in: boolean | null
}

type BracketRow = {
  tournament_id: string
  participant_a_id: string
  participant_b_id: string
}

type ParticipantRow = {
  id: string
  name: string | null
  email: string | null
  psn_id: string | null
  platform_type: string | null
  country: string | null
  marketing_opt_in: boolean | null
  signup_timestamp: string | null
}

export async function getTournamentsDashboardData(): Promise<TournamentAdmin[]> {
  const tournaments = await sql<TournamentRow>(
    `SELECT id, name, slug, game, status, prize, entry, format, stream_url, image_url,
            max_participants, started_at, ended_at, created_at
     FROM public.tournaments
     ORDER BY created_at DESC NULLS LAST`
  )

  const waitlist = await sql<WaitlistRow>(
    `SELECT w.tournament_id, w.status, w.gaming_id AS w_gaming_id, w.partner_ref, w.signup_timestamp,
            p.id AS player_id, p.name, p.email, p.gaming_id, p.platform, p.country, p.marketing_opt_in
     FROM public.waitlist_entries w
     JOIN public.players p ON p.id = w.player_id`
  )

  const brackets = await sql<BracketRow>(
    `SELECT tournament_id, participant_a_id, participant_b_id FROM public.brackets`
  )

  const participants = await sql<ParticipantRow>(
    `SELECT id, name, email, psn_id, platform_type, country, marketing_opt_in, signup_timestamp
     FROM public.participants`
  )

  const participantMap = new Map(participants.map((p) => [p.id, p]))

  // Group entrants by tournament_id. Dedupe key = lowercased email (falls back to
  // a source-prefixed id when email is null) so the same human counted once even
  // though waitlist_entries (player_id) and brackets/participants (participant_id)
  // use different primary keys. Waitlist rows are inserted first and win.
  const entrantsByTournament = new Map<string, Map<string, Entrant>>()

  function bucket(tid: string): Map<string, Entrant> {
    if (!entrantsByTournament.has(tid)) entrantsByTournament.set(tid, new Map())
    return entrantsByTournament.get(tid)!
  }

  function dedupeKey(email: string | null, fallback: string): string {
    const e = email?.trim().toLowerCase()
    return e ? `e:${e}` : fallback
  }

  // S2: waitlist_entries -> players
  for (const w of waitlist) {
    bucket(w.tournament_id).set(dedupeKey(w.email, `w:${w.player_id}`), {
      id: w.player_id,
      source: 'waitlist',
      name: w.name ?? '—',
      gamingId: w.w_gaming_id ?? w.gaming_id,
      email: w.email,
      status: w.status,
      platform: w.platform,
      country: w.country,
      marketingOptIn: Boolean(w.marketing_opt_in),
      partnerRef: w.partner_ref,
      signupAt: w.signup_timestamp,
    })
  }

  // S1: distinct participants appearing in brackets
  for (const b of brackets) {
    const map = bucket(b.tournament_id)
    for (const pid of [b.participant_a_id, b.participant_b_id]) {
      if (!pid) continue // skip null byes
      const p = participantMap.get(pid)
      if (!p) continue
      const key = dedupeKey(p.email, `b:${pid}`)
      if (map.has(key)) continue // don't clobber waitlist rows / dedupe repeat brackets
      map.set(key, {
        id: pid,
        source: 'bracket',
        name: p.name ?? '—',
        gamingId: p.psn_id,
        email: p.email,
        status: 'in bracket',
        platform: p.platform_type,
        country: p.country,
        marketingOptIn: Boolean(p.marketing_opt_in),
        partnerRef: null,
        signupAt: p.signup_timestamp,
      })
    }
  }

  return tournaments.map((t) => {
    const entrants = Array.from(entrantsByTournament.get(t.id)?.values() ?? [])
    entrants.sort((a, b) => a.name.localeCompare(b.name))
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      game: t.game,
      status: t.status,
      format: t.format,
      entry: t.entry,
      prize: t.prize,
      streamUrl: t.stream_url,
      imageUrl: t.image_url,
      maxParticipants: t.max_participants,
      startedAt: t.started_at,
      endedAt: t.ended_at,
      createdAt: t.created_at,
      entrantCount: entrants.length,
      entrants,
    }
  })
}
