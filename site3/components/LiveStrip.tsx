'use client'

// Compact "matchday" scoreboard for the homepage: current round only,
// broadcast-style cards. Full bracket lives on /tournament.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BracketData, BracketMatch, BracketRound, WATCH_FALLBACK, formatSAST } from '@/lib/bracket'

const WIN = '#34d27b'

function currentRoundIndex(rounds: BracketRound[]): number {
  const has = (r: BracketRound, s: string) => r.matches.some((m) => m.state === s)
  let i = rounds.findIndex((r) => has(r, 'live'))
  if (i >= 0) return i
  i = rounds.findIndex((r) => has(r, 'scheduled'))
  if (i >= 0) return i
  i = rounds.findIndex((r) => r.matches.some((m) => m.state !== 'completed' && m.state !== 'walkover'))
  return i >= 0 ? i : Math.max(0, rounds.length - 1)
}

function StateTag({ match }: { match: BracketMatch }) {
  if (match.state === 'live')
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--accent)' }}>
        <span className="live-dot" />LIVE
      </span>
    )
  if (match.state === 'completed' || match.state === 'walkover')
    return <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--ink-light)' }}>FT</span>
  if (match.scheduledAt)
    return <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--ink-light)', whiteSpace: 'nowrap' }}>KO {formatSAST(match.scheduledAt)}</span>
  return <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--ink-light)' }}>TBC</span>
}

function Row({ match, side }: { match: BracketMatch; side: 'a' | 'b' }) {
  const player = match[side]
  const score = side === 'a' ? match.scoreA : match.scoreB
  const done = match.state === 'completed' || match.state === 'walkover'
  const won = done && match.winner === side
  const lost = done && match.winner !== null && match.winner !== side
  // PSN id only — players must never see opponents' real names (project rule).
  const label = player?.psn ?? player?.name ?? 'TBC'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{
        fontSize: 14, fontWeight: won ? 700 : 600,
        color: player ? 'var(--ink)' : 'var(--ink-light)',
        fontStyle: player ? 'normal' : 'italic',
        opacity: lost ? 0.45 : 1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      {done && score != null && (
        <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: won ? WIN : 'var(--ink-light)', opacity: lost ? 0.6 : 1 }}>
          {score}
        </span>
      )}
    </div>
  )
}

function MatchCard({ match }: { match: BracketMatch }) {
  const live = match.state === 'live'
  const card = (
    <div style={{
      minWidth: 230, flex: '0 0 auto',
      borderRadius: 12,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: live ? '3px solid var(--accent)' : '1px solid var(--border)',
      padding: '12px 16px 14px',
      display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <StateTag match={match} />
        {match.state === 'walkover' && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#e0a955' }}>
            {match.bye ? 'Bye' : 'Walkover'}
          </span>
        )}
      </div>
      <Row match={match} side="a" />
      <Row match={match} side="b" />
    </div>
  )
  if (!live) return card
  return (
    <a href={match.streamUrl ?? WATCH_FALLBACK} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex' }}>
      {card}
    </a>
  )
}

function FinalMarquee({ match }: { match: BracketMatch }) {
  const live = match.state === 'live'
  const done = match.state === 'completed' || match.state === 'walkover'
  const aName = match.a?.psn ?? match.a?.name ?? 'TBC'
  const bName = match.b?.psn ?? match.b?.name ?? 'TBC'
  return (
    <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'linear-gradient(180deg, rgba(17,32,56,0.85) 0%, rgba(10,22,40,0.4) 100%)', padding: 'clamp(28px, 5vw, 52px) 24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
        {live && <span className="live-dot" />}
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: live ? 'var(--accent)' : 'var(--ink-light)' }}>
          {live ? 'The Final — live now' : done ? 'The Final — full time' : 'The Final'}
        </span>
      </div>
      <p className="font-display" style={{ fontSize: 'clamp(26px, 4.5vw, 54px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
        {aName} <em style={{ fontWeight: 300, fontStyle: 'italic', color: 'var(--ink-light)', padding: '0 0.15em' }}>vs</em> {bName}
      </p>
      {done && match.scoreA != null && match.scoreB != null && (
        <p style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 800, color: 'var(--ink)', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{match.scoreA} – {match.scoreB}</p>
      )}
      {!done && match.scheduledAt && (
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-light)', marginTop: 12 }}>Kick-off {formatSAST(match.scheduledAt)} SAST</p>
      )}
      {!done && (
        <a href={match.streamUrl ?? WATCH_FALLBACK} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: 22, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px 26px', borderRadius: 8, textDecoration: 'none' }}>
          Watch the Final live →
        </a>
      )}
    </div>
  )
}

export default function LiveStrip() {
  const [data, setData] = useState<BracketData | null>(null)

  useEffect(() => {
    let on = true
    fetch('/api/tournament/bracket')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on) setData(d) })
      .catch(() => {})
    return () => { on = false }
  }, [])

  if (!data?.rounds?.length) return null
  const round = data.rounds[currentRoundIndex(data.rounds)]

  return (
    <section className="pt-2 pb-6">
      <div className="mx-auto max-w-[1280px] px-6">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-light)' }}>Matchday</p>
            <p className="font-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{round.label}</p>
          </div>
          <Link href="/tournament" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-mid)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Full bracket →
          </Link>
        </div>
        {round.matches.length === 1 ? (
          <FinalMarquee match={round.matches[0]} />
        ) : (
          <div className="cc-strip" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' }}>
            {round.matches.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </div>
    </section>
  )
}
