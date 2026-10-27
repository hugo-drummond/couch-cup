import { notFound } from 'next/navigation'
import PageLayout from '@/components/PageLayout'
import TournamentBracket from '@/components/TournamentBracket'
import { sql } from '@/lib/supabase'

export const revalidate = 300

type PastTournament = {
  id: string
  name: string
  game: string | null
  status: string
  prize: string | null
  entry: string | null
  format: string | null
  image_url: string | null
  max_participants: number
  started_at: string | null
  ended_at: string | null
  player_count: number
  winner_psn: string | null
}

async function getTournament(slug: string): Promise<PastTournament | null> {
  try {
    const rows = await sql<PastTournament>(`
      SELECT
        t.id, t.name, t.game, t.status, t.prize, t.entry, t.format, t.image_url,
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
      WHERE (t.slug = $1 OR t.id::text = $1) AND t.status = 'completed'
      LIMIT 1
    `, [slug])
    return rows[0] ?? null
  } catch {
    return null
  }
}

const fmt = (s: string) =>
  new Date(s).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getTournament(slug)
  return { title: `${t?.name ?? 'Tournament'} — Couch Cup` }
}

export default async function PastTournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getTournament(slug)
  if (!t) notFound()

  const details: [string, string][] = []
  if (t.winner_psn) details.push(['Winner', t.winner_psn])
  if (t.prize) details.push(['Prize', t.prize])
  if (t.entry) details.push(['Entry', t.entry])
  if (t.format) details.push(['Format', t.format])
  if (t.game) details.push(['Game', t.game])
  details.push(['Players', `${t.player_count || t.max_participants}`])
  if (t.started_at) details.push(['Started', fmt(t.started_at)])
  if (t.ended_at) details.push(['Ended', fmt(t.ended_at)])

  return (
    <PageLayout eyebrow="Past tournament" title={t.name} lead={`How ${t.name} played out — full bracket and final result.`}>
      {/* Break out of the article column so the full tree fits; details inline below */}
      <div style={{ position: 'relative', left: '50%', transform: 'translateX(-50%)', width: 'min(1232px, calc(100vw - 48px))' }}>
        <div className="rounded-xl p-6 md:p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3px solid var(--accent)', marginBottom: 40 }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--accent)' }}>Final result</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-4">
            {details.map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-light)' }}>{l}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <TournamentBracket tournamentId={t.id} />
      </div>
    </PageLayout>
  )
}
