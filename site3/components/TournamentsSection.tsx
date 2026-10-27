'use client'

import { useEffect, useState } from 'react'

type Tournament = {
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

type Payload = { current: Tournament[]; past: Tournament[] }

function formatDateRange(start: string | null, end: string | null) {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (start) return `From ${fmt(start)}`
  return null
}

/* One tournament card — image as full background, info panel over it. */
function TournamentCard({ t, compact }: { t: Tournament; compact?: boolean }) {
  const isLive = t.status === 'active'
  const isReg = t.status === 'registration'
  const isPast = t.status === 'completed'

  const href = isReg ? '#signup' : isPast ? `/tournament/${t.slug ?? t.id}` : '/tournament'
  const eyebrow = isLive ? `Live — ${t.name}` : isReg ? 'Registration open' : t.name
  const cta = isReg ? 'Enter free →' : isPast ? 'View results →' : 'View bracket →'

  const rows: [string, string][] = []
  if (t.prize) rows.push(['Prize', t.prize])
  if (t.entry) rows.push(['Entry', t.entry])
  if (!compact && t.format) rows.push(['Format', t.format])
  if (isReg) rows.push(['Starts', 'Fri 28 Aug 2026'])
  if (isPast && t.winner_psn) rows.push(['Winner', t.winner_psn])
  else if (isLive) rows.push(['Status', `${t.player_count || t.max_participants} players competing`])
  else if (isPast) {
    const d = formatDateRange(t.started_at, t.ended_at)
    if (d) rows.push(['Played', d])
  }

  const go = () => { window.location.href = href }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter') go() }}
      className="rounded-2xl overflow-hidden transition-transform cc-tcard"
      style={{ position: 'relative', border: '1px solid var(--border)', cursor: 'pointer', outlineColor: 'var(--accent)' }}
    >
      {/* Background image */}
      <img
        src={t.image_url ?? '/images/stadium.jpg'}
        alt=""
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
      />
      {/* Navy duotone + directional gradient so the info reads over the photo */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,22,40,0.45)', mixBlendMode: 'multiply' }} />
      <div
        className={compact ? '' : 'hidden md:block'}
        style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 30%, rgba(10,22,40,0.92) 72%)' }}
      />
      <div
        className={compact ? 'hidden' : 'md:hidden'}
        style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #081120 0%, rgba(8,17,32,0.88) 30%, rgba(8,17,32,0.25) 65%, transparent 85%)' }}
      />
      {compact && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #081120 0%, rgba(8,17,32,0.9) 35%, rgba(8,17,32,0.3) 70%, transparent 90%)' }} />
      )}

      {/* Live badge, top-left */}
      {isLive && (
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(5,10,22,0.75)', border: '1px solid rgba(200,216,232,0.15)' }}>
          <span className="live-dot" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>Live</span>
        </div>
      )}

      {/* Info panel */}
      <div
        className={compact ? 'p-5 pt-40' : 'p-6 pt-44 md:p-10 md:pl-0'}
        style={{ position: 'relative', display: 'flex', justifyContent: compact ? 'flex-start' : undefined }}
      >
        <div
          className={compact ? 'w-full' : 'w-full md:ml-auto md:w-[340px]'}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: isPast ? 'var(--ink-light)' : 'var(--accent)' }}>
            {eyebrow}
          </p>
          <p className="font-display" style={{ fontSize: compact ? 24 : 'clamp(24px, 3vw, 32px)', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.12, marginBottom: 18 }}>
            {t.game ?? t.name}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 22 }}>
            {rows.map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(200,216,232,0.18)', paddingBottom: 7 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>{l}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href={href}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-[14px] px-6 py-3 rounded-lg text-center transition-all"
              style={{ background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-dark)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
              {cta}
            </a>
            {isLive && t.stream_url && (
              <a
                href={t.stream_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-[14px] px-6 py-3 rounded-lg text-center transition-all"
                style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(200,216,232,0.3)', textDecoration: 'none' }}
              >
                Watch Live →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* Empty state for the Current tab — future tournament teaser. */
function ComingSoon() {
  return (
    <div className="rounded-2xl p-8 md:p-12 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3px solid var(--accent)' }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--accent)' }}>Next tournament</p>
      <p className="font-display" style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 10 }}>
        Next tournament is coming.
      </p>
      <p style={{ fontSize: 15, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 24, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
        One tournament at a time, done properly. Join the waitlist and you&apos;re in the draw when signups open.
      </p>
      <a
        href="#signup"
        className="inline-block font-semibold text-[14px] px-8 py-3 rounded-lg transition-all"
        style={{ background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-dark)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
      >
        Join the waitlist →
      </a>
    </div>
  )
}

export default function TournamentsSection() {
  const [tab, setTab] = useState<'current' | 'past'>('current')
  const [data, setData] = useState<Payload | null>(null)

  useEffect(() => {
    let on = true
    fetch('/api/tournaments')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d) setData(d) })
      .catch(() => {})
    return () => { on = false }
  }, [])

  const tabs: ['current' | 'past', string][] = [['current', 'Current'], ['past', 'Past']]
  const showPastTab = !data || data.past.length > 0

  return (
    <section id="tournaments" className="py-4 pb-8">
      <style>{`.cc-tcard:hover{transform:translateY(-2px)} @media (prefers-reduced-motion: reduce){.cc-tcard:hover{transform:none}}`}</style>
      <div className="mx-auto max-w-[1280px] px-6">
        <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {tabs.map(([key, label]) => (
            (key === 'current' || showPastTab) && (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="text-[11px] font-bold uppercase tracking-[0.12em] pb-3 transition-colors"
                style={{
                  color: tab === key ? 'var(--ink)' : 'var(--ink-light)',
                  borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                {label} tournaments
              </button>
            )
          ))}
        </div>

        {!data ? (
          <div className="rounded-2xl cc-skel" style={{ minHeight: 320, background: 'var(--surface)', border: '1px solid var(--border)' }} />
        ) : tab === 'current' ? (
          data.current.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {data.current.map((t) => <TournamentCard key={t.id} t={t} />)}
            </div>
          ) : (
            <ComingSoon />
          )
        ) : (
          <div className={data.past.length > 1 ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6' : ''}>
            {data.past.map((t) => <TournamentCard key={t.id} t={t} compact={data.past.length > 1} />)}
          </div>
        )}
      </div>
    </section>
  )
}
