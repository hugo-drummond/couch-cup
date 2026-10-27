'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

type State =
  | { status: 'loading' }
  | { status: 'ready'; playerName: string; tournamentName: string; game: string }
  | { status: 'accepted' }
  | { status: 'declined' }
  | { status: 'already_used' }
  | { status: 'expired' }
  | { status: 'error' }

export default function RespondPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/tournament/respond?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error === 'already_used') return setState({ status: 'already_used' })
        if (data.error === 'expired') return setState({ status: 'expired' })
        if (data.error) return setState({ status: 'error' })
        setState({ status: 'ready', playerName: data.playerName, tournamentName: data.tournamentName, game: data.game })
      })
      .catch(() => setState({ status: 'error' }))
  }, [token])

  async function respond(action: 'accept' | 'decline') {
    setSubmitting(true)
    try {
      const res = await fetch('/api/tournament/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      })
      const data = await res.json()
      if (data.error === 'already_used') return setState({ status: 'already_used' })
      if (data.error) return setState({ status: 'error' })
      setState({ status: action === 'accept' ? 'accepted' : 'declined' })
    } catch {
      setState({ status: 'error' })
    } finally {
      setSubmitting(false)
    }
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
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

          {state.status === 'loading' && (
            <p style={{ color: 'var(--ink-mid)', fontSize: 16 }}>Loading…</p>
          )}

          {state.status === 'ready' && (
            <>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-light)', marginBottom: 16 }}>
                {state.game}
              </p>
              <h1 className="font-display" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                You've been selected.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 8 }}>
                Hi {state.playerName.split(' ')[0]}, your spot in <strong style={{ color: 'var(--ink)' }}>{state.tournamentName}</strong> is reserved.
              </p>
              <p style={{ fontSize: 15, color: 'var(--ink-light)', marginBottom: 40 }}>
                Confirm your spot below. If you decline, it goes to the next person on the reserve list.
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => respond('accept')}
                  disabled={submitting}
                  style={{
                    background: 'var(--accent)', color: '#fff',
                    padding: '14px 32px', borderRadius: 8,
                    fontSize: 16, fontWeight: 700, border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = 'var(--accent-dark)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
                >
                  Accept My Spot
                </button>
                <button
                  onClick={() => respond('decline')}
                  disabled={submitting}
                  style={{
                    background: 'transparent', color: 'var(--ink-mid)',
                    padding: '14px 32px', borderRadius: 8,
                    fontSize: 16, fontWeight: 600, border: '1px solid var(--border)',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  Decline
                </button>
              </div>
            </>
          )}

          {state.status === 'accepted' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
              <h1 className="font-display" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                You're in.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                We'll be in touch with your Round 1 opponent and match details shortly.
              </p>
            </>
          )}

          {state.status === 'declined' && (
            <>
              <h1 className="font-display" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Got it.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                Your spot has been released. We'll offer it to the next person on the reserve list.
              </p>
            </>
          )}

          {state.status === 'already_used' && (
            <>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Already responded.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                This link has already been used.
              </p>
            </>
          )}

          {state.status === 'expired' && (
            <>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Link expired.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                This link is no longer valid. Email us at <a href="mailto:hello@couchcup.co.za" style={{ color: 'var(--accent)' }}>hello@couchcup.co.za</a> if you think this is a mistake.
              </p>
            </>
          )}

          {state.status === 'error' && (
            <>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Something went wrong.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                Email us at <a href="mailto:hello@couchcup.co.za" style={{ color: 'var(--accent)' }}>hello@couchcup.co.za</a> and we'll sort it out.
              </p>
            </>
          )}

        </div>
      </main>
    </>
  )
}
