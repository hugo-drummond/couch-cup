'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BracketData,
  BracketMatch,
  BracketRound,
  WATCH_FALLBACK,
  formatSAST,
} from '@/lib/bracket'

/* ── tokens local to the bracket ─────────────────────────────────────────── */
const WIN = '#34d27b'
const WIN_TINT = 'rgba(52,210,123,0.10)'
const LOSS_TINT = 'rgba(220,20,48,0.08)'

/* ── one match card ──────────────────────────────────────────────────────── */
function PlayerRow({
  player,
  score,
  isWinner,
  isLoser,
  showScore,
}: {
  player: { name: string | null; psn: string | null } | null
  score: number | null
  isWinner: boolean
  isLoser: boolean
  showScore: boolean
}) {
  // PSN id only — players must never see opponents' real names (project rule).
  const label = player?.psn ?? player?.name ?? null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '9px 12px',
        background: isWinner ? WIN_TINT : isLoser ? LOSS_TINT : 'transparent',
        borderLeft: `2px solid ${isWinner ? WIN : 'transparent'}`,
        opacity: isLoser ? 0.5 : 1,
        transition: 'background .2s',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: isWinner ? 700 : 600,
          color: label ? 'var(--ink)' : 'var(--ink-light)',
          fontStyle: label ? 'normal' : 'italic',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label ?? 'TBC'}
      </span>
      {showScore && score != null && (
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: isWinner ? WIN : 'var(--ink-mid)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 14,
            textAlign: 'right',
          }}
        >
          {score}
        </span>
      )}
    </div>
  )
}

function MatchNode({
  match,
  refCb,
  delay = 0,
}: {
  match: BracketMatch
  refCb?: (el: HTMLDivElement | null) => void
  delay?: number
}) {
  const { state, a, b, scoreA, scoreB, winner } = match
  const done = state === 'completed' || state === 'walkover'
  const showScore = done

  return (
    <div
      ref={refCb}
      className="cc-node"
      style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.25)',
        animationDelay: `${delay}ms`,
      }}
    >
      <PlayerRow
        player={a}
        score={scoreA}
        isWinner={done && winner === 'a'}
        isLoser={done && winner === 'b'}
        showScore={showScore}
      />
      <div style={{ height: 1, background: 'var(--border)' }} />
      <PlayerRow
        player={b}
        score={scoreB}
        isWinner={done && winner === 'b'}
        isLoser={done && winner === 'a'}
        showScore={showScore}
      />
      <MatchFooter match={match} />
    </div>
  )
}

function MatchFooter({ match }: { match: BracketMatch }) {
  const { state, scheduledAt, bye } = match

  if (state === 'tbd' || state === 'completed') return null

  const isMatchTime =
    state !== 'walkover' &&
    !!scheduledAt &&
    Date.now() >= new Date(scheduledAt).getTime()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '7px 12px',
        borderTop: '1px solid var(--border)',
        background: 'rgba(0,0,0,0.18)',
      }}
    >
      {state === 'walkover' ? (
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#e0a955' }}>
          {bye ? 'Bye' : 'Walkover'}
        </span>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {scheduledAt ? formatSAST(scheduledAt) : 'Time TBC'}
        </span>
      )}

      {isMatchTime && (
        <a
          href={WATCH_FALLBACK}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', whiteSpace: 'nowrap', textDecoration: 'none' }}
        >
          <span className="cc-live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
          Watch Live
        </a>
      )}
    </div>
  )
}

/* ── desktop tree with measured SVG connectors ───────────────────────────── */
function DesktopTree({ rounds }: { rounds: BracketRound[] }) {
  const treeRef = useRef<HTMLDivElement>(null)
  const nodes = useRef<Map<string, HTMLDivElement>>(new Map())
  const [paths, setPaths] = useState<string[]>([])
  const [dims, setDims] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const compute = () => {
      const tree = treeRef.current
      if (!tree) return
      const root = tree.getBoundingClientRect()
      setDims({ w: root.width, h: root.height })
      const segs: string[] = []
      for (let r = 1; r < rounds.length; r++) {
        rounds[r].matches.forEach((m, i) => {
          const childEl = nodes.current.get(m.id)
          if (!childEl) return
          const c = childEl.getBoundingClientRect()
          const childX = c.left - root.left
          const childY = c.top - root.top + c.height / 2
          ;[rounds[r - 1].matches[2 * i], rounds[r - 1].matches[2 * i + 1]].forEach((f) => {
            if (!f) return
            const fEl = nodes.current.get(f.id)
            if (!fEl) return
            const fr = fEl.getBoundingClientRect()
            const fx = fr.right - root.left
            const fy = fr.top - root.top + fr.height / 2
            const midX = (fx + childX) / 2
            segs.push(`M ${fx} ${fy} H ${midX} V ${childY} H ${childX}`)
          })
        })
      }
      setPaths(segs)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (treeRef.current) ro.observe(treeRef.current)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [rounds])

  return (
    <div ref={treeRef} style={{ position: 'relative', display: 'flex', gap: 52, alignItems: 'stretch' }}>
      <svg
        width={dims.w}
        height={dims.h}
        style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'visible' }}
      >
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(139,168,196,0.38)" strokeWidth={2} />
        ))}
      </svg>

      {rounds.map((round, ri) => (
        <div
          key={round.roundNumber}
          style={{
            flex: '1 1 0',
            minWidth: 196,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-around',
            gap: 18,
          }}
        >
          <RoundHeader round={round} />
          {round.matches.map((m, mi) => (
            <div key={m.id} style={{ flex: '1 1 0', display: 'flex', alignItems: 'center' }}>
              <MatchNode
                match={m}
                delay={ri * 90 + mi * 45}
                refCb={(el) => {
                  if (el) nodes.current.set(m.id, el)
                  else nodes.current.delete(m.id)
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function RoundHeader({ round }: { round: BracketRound }) {
  return (
    <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', marginBottom: 4 }}>
      <p
        className="font-display"
        style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.01em' }}
      >
        {round.label}
      </p>
    </div>
  )
}

/* ── mobile: tabbed single round ─────────────────────────────────────────── */
function MobileRounds({ rounds, defaultIdx }: { rounds: BracketRound[]; defaultIdx: number }) {
  const [active, setActive] = useState(defaultIdx)
  const round = rounds[active]

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 12,
          marginBottom: 4,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {rounds.map((r, i) => {
          const on = i === active
          return (
            <button
              key={r.roundNumber}
              onClick={() => setActive(i)}
              style={{
                flex: '0 0 auto',
                padding: '7px 14px',
                borderRadius: 999,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                background: on ? 'var(--accent)' : 'transparent',
                color: on ? '#fff' : 'var(--ink-light)',
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {round.matches.map((m, i) => (
          <MatchNode key={m.id} match={m} delay={i * 50} />
        ))}
      </div>
    </div>
  )
}

/* ── presentational root (exported for preview/testing) ──────────────────── */
export function BracketView({ data }: { data: BracketData }) {
  const defaultIdx = useMemo(() => liveRoundIndex(data.rounds), [data.rounds])
  if (!data.rounds.length) return null

  return (
    <Shell>
      <div className="hidden md:block">
        <DesktopTree rounds={data.rounds} />
      </div>
      <div className="md:hidden">
        <MobileRounds rounds={data.rounds} defaultIdx={defaultIdx} />
      </div>
    </Shell>
  )
}

function liveRoundIndex(rounds: BracketRound[]): number {
  const has = (r: BracketRound, s: string) => r.matches.some((m) => m.state === s)
  let i = rounds.findIndex((r) => has(r, 'live'))
  if (i >= 0) return i
  i = rounds.findIndex((r) => has(r, 'scheduled'))
  if (i >= 0) return i
  i = rounds.findIndex((r) => r.matches.some((m) => m.state !== 'completed' && m.state !== 'walkover'))
  return i >= 0 ? i : Math.max(0, rounds.length - 1)
}

/* ── shared section shell (header + framed container) ────────────────────── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <p className="text-[11px] font-bold uppercase" style={{ letterSpacing: '0.12em', color: 'var(--ink-light)' }}>
          The Bracket
        </p>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div
        style={{
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: 'linear-gradient(180deg, rgba(17,32,56,0.55) 0%, rgba(10,22,40,0.2) 100%)',
          padding: 24,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/* ── loading skeleton (shown while fetching, instead of a blank gap) ──────── */
function BracketSkeleton() {
  const cols = [8, 4, 2, 1]
  const box = (delay: number, key?: number) => (
    <div
      key={key}
      className="cc-skel"
      style={{ height: 62, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', animationDelay: `${delay}ms` }}
    />
  )
  return (
    <Shell>
      <div className="hidden md:flex" style={{ gap: 52 }}>
        {cols.map((n, ci) => (
          <div key={ci} style={{ flex: '1 1 0', minWidth: 196, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 18 }}>
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} style={{ flex: '1 1 0', display: 'flex', alignItems: 'center' }}>{box((ci * 4 + i) * 60)}</div>
            ))}
          </div>
        ))}
      </div>
      <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2, 3].map((i) => box(i * 80, i))}
      </div>
    </Shell>
  )
}

/* ── container: fetches live data, hides until Round of 16 ────────────────── */
export default function TournamentBracket({ tournamentId }: { tournamentId?: string } = {}) {
  const [data, setData] = useState<BracketData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    fetch(tournamentId ? `/api/tournament/bracket?tournamentId=${tournamentId}` : '/api/tournament/bracket')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!on) return
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (on) setLoading(false)
      })
    return () => {
      on = false
    }
  }, [tournamentId])

  if (loading) return <BracketSkeleton />
  if (!data || !data.rounds?.length) return null
  return <BracketView data={data} />
}

const KEYFRAMES = `
@keyframes ccFadeUp { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
.cc-node { animation: ccFadeUp .5s cubic-bezier(.2,.7,.2,1) both; }
@keyframes ccPulse { 0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(220,20,48,.5);} 50% { opacity:.55; box-shadow:0 0 0 4px rgba(220,20,48,0);} }
.cc-live-dot { animation: ccPulse 1.4s ease-in-out infinite; }
@keyframes ccSkel { 0%,100% { opacity:.45 } 50% { opacity:.8 } }
.cc-skel { animation: ccSkel 1.4s ease-in-out infinite both; }
@media (prefers-reduced-motion: reduce){ .cc-node,.cc-live-dot,.cc-skel{ animation:none !important; } }
`
