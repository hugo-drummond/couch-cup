'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

type State =
  | { status: 'loading' }
  | { status: 'ready'; playerName: string; opponentPsn: string; scheduledAt: string | null; expiresAt: string }
  | { status: 'submitted' }
  | { status: 'submitted_locked'; playerName: string; opponentPsn: string; scoreReporter: number; scoreOpponent: number }
  | { status: 'waiting' }
  | { status: 'already_used' }
  | { status: 'expired' }
  | { status: 'error'; message?: string }

export default function MatchPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [submitting, setSubmitting] = useState(false)
  const [goalsFor, setGoalsFor] = useState('')
  const [goalsAgainst, setGoalsAgainst] = useState('')
  const [streamUrl, setStreamUrl] = useState('')
  const [fieldError, setFieldError] = useState('')

  const gfNum = parseInt(goalsFor)
  const gaNum = parseInt(goalsAgainst)
  const isDraw = !isNaN(gfNum) && !isNaN(gaNum) && gfNum >= 0 && gaNum >= 0 && gfNum === gaNum
  void isDraw // draw is valid, no penalty selection needed

  useEffect(() => {
    fetch(`/api/tournament/match/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error === 'already_used') return setState({ status: 'already_used' })
        if (data.error === 'expired') return setState({ status: 'expired' })
        if (data.error) return setState({ status: 'error' })
        if (data.type !== 'submission') return setState({ status: 'error', message: 'Invalid link type.' })
        if (data.status === 'submitted') {
          return setState({
            status: 'submitted_locked',
            playerName: data.playerName,
            opponentPsn: data.opponentPsn,
            scoreReporter: data.scoreReporter,
            scoreOpponent: data.scoreOpponent,
          })
        }
        setState({ status: 'ready', playerName: data.playerName, opponentPsn: data.opponentPsn, scheduledAt: data.scheduledAt, expiresAt: data.expiresAt })
      })
      .catch(() => setState({ status: 'error' }))
  }, [token])


  async function submit() {
    setFieldError('')
    const gf = parseInt(goalsFor)
    const ga = parseInt(goalsAgainst)

    if (isNaN(gf) || isNaN(ga) || gf < 0 || ga < 0) {
      setFieldError('Enter valid scores.')
      return
    }
    if (!streamUrl.trim()) {
      setFieldError('YouTube or Twitch stream URL is required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/tournament/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, goalsFor: gf, goalsAgainst: ga, streamUrl: streamUrl.trim() }),
      })
      const data = await res.json()
      if (data.error === 'already_submitted') return setState({ status: 'already_used' })
      if (data.error === 'window_closed') return setState({ status: 'error', message: 'The 4-hour score window has closed. This match has been resolved automatically — contact us if that looks wrong.' })
      if (data.error === 'already_resolved') return setState({ status: 'error', message: 'This match is already resolved. No further scores can be submitted.' })
      if (data.error) return setState({ status: 'error' })
      if (data.status === 'waiting_for_opponent') return setState({ status: 'waiting' })
      if (data.status === 'draw_rematch') return setState({ status: 'waiting' })
      setState({ status: 'submitted' })
    } catch {
      setState({ status: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 16,
    color: 'var(--ink)',
    background: 'var(--bg)',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--ink-mid)',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  }

  return (
    <>
      <header style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', height: 72, display: 'flex', alignItems: 'center' }}>
        <div className="mx-auto max-w-[1280px] px-6 w-full">
          <Link href="/">
            <Image src="/images/logo-transparent.png" alt="Couch Cup" width={48} height={48} className="object-contain" />
          </Link>
        </div>
      </header>

      <main style={{ minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ maxWidth: 480, width: '100%' }}>

          {state.status === 'loading' && (
            <p style={{ color: 'var(--ink-mid)', fontSize: 16, textAlign: 'center' }}>Loading…</p>
          )}

          {state.status === 'ready' && (
            <>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-light)', marginBottom: 16 }}>
                Score Submission
              </p>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 12 }}>
                Submit your score.
              </h1>
              <p style={{ fontSize: 16, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 32 }}>
                vs <strong style={{ color: 'var(--ink)' }}>{state.opponentPsn}</strong>
                {state.scheduledAt && (
                  <> · {new Date(state.scheduledAt).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' })}</>
                )}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Your goals</label>
                    <input
                      type="number" min={0} value={goalsFor}
                      onChange={e => setGoalsFor(e.target.value)}
                      style={inputStyle}
                      placeholder="0"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Opponent goals</label>
                    <input
                      type="number" min={0} value={goalsAgainst}
                      onChange={e => setGoalsAgainst(e.target.value)}
                      style={inputStyle}
                      placeholder="0"
                    />
                  </div>
                </div>

                {isDraw && (
                  <div style={{ borderRadius: 8, border: '1px solid #f0d0d5', background: '#fff8f8', padding: '12px 16px' }}>
                    <p style={{ fontSize: 14, color: '#b91c36', margin: 0 }}>
                      It's a draw. Submit this score and you'll both receive a rematch link to play again.
                    </p>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>YouTube or Twitch stream URL <span style={{ color: '#db1230' }}>*</span></label>
                  <p style={{ fontSize: 13, color: '#8A97A8', margin: '2px 0 8px' }}>
                    Paste the link to <strong>this match&apos;s video/VOD</strong> — not your channel page.
                  </p>
                  <input
                    type="url" value={streamUrl}
                    onChange={e => setStreamUrl(e.target.value)}
                    style={inputStyle}
                    placeholder="https://youtube.com/watch?v=... or https://twitch.tv/videos/..."
                  />
                </div>

              </div>

              {fieldError && (
                <p style={{ color: '#db1230', fontSize: 14, marginTop: 12 }}>{fieldError}</p>
              )}

              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  marginTop: 28, width: '100%',
                  background: 'var(--accent)', color: '#fff',
                  padding: '14px 24px', borderRadius: 8,
                  fontSize: 16, fontWeight: 700, border: 'none',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = 'var(--accent-dark)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
              >
                {submitting ? 'Submitting…' : 'Submit Score'}
              </button>

              <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 16, textAlign: 'center' }}>
                Link expires {new Date(state.expiresAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' })}
              </p>
            </>
          )}

          {state.status === 'submitted' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Score submitted.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                Both scores match. Result confirmed.
              </p>
            </div>
          )}

          {state.status === 'submitted_locked' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-light)', marginBottom: 16 }}>
                Score Submitted
              </p>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 32 }}>
                Score submitted: You {state.scoreReporter} – {state.scoreOpponent} {state.opponentPsn}.
              </h1>
              <p style={{ fontSize: 16, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                This is final.
              </p>
            </div>
          )}

          {state.status === 'waiting' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Score received.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                Waiting for your opponent to submit their score. Result confirmed once both are in.
              </p>
            </div>
          )}

          {state.status === 'already_used' && (
            <div style={{ textAlign: 'center' }}>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Already submitted.</h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>This score has already been submitted.</p>
            </div>
          )}

          {state.status === 'expired' && (
            <div style={{ textAlign: 'center' }}>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Link expired.</h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                Email us at <a href="mailto:hello@couchcup.co.za" style={{ color: 'var(--accent)' }}>hello@couchcup.co.za</a> if you think this is a mistake.
              </p>
            </div>
          )}

          {state.status === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Something went wrong.</h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                {'message' in state && state.message
                  ? state.message
                  : <>Email us at <a href="mailto:hello@couchcup.co.za" style={{ color: 'var(--accent)' }}>hello@couchcup.co.za</a> and we'll sort it out.</>
                }
              </p>
            </div>
          )}

        </div>
      </main>
    </>
  )
}
