'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

type State =
  | { status: 'loading' }
  | { status: 'accepted' }
  | { status: 'forfeited' }
  | { status: 'already_resolved' }
  | { status: 'already_used' }
  | { status: 'expired' }
  | { status: 'error' }

export default function ForfeitPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    fetch('/api/tournament/forfeit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error === 'already_used') return setState({ status: 'already_used' })
        if (data.error === 'expired') return setState({ status: 'expired' })
        if (data.error) return setState({ status: 'error' })
        if (data.status === 'already_resolved') return setState({ status: 'already_resolved' })
        if (data.action === 'declined') return setState({ status: 'forfeited' })
        setState({ status: 'accepted' })
      })
      .catch(() => setState({ status: 'error' }))
  }, [token])

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
            <p style={{ color: 'var(--ink-mid)', fontSize: 16 }}>Confirming…</p>
          )}

          {state.status === 'accepted' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Match confirmed.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                You're locked in. Check your email for the full match details and your link to submit the score afterwards.
              </p>
            </>
          )}

          {state.status === 'forfeited' && (
            <>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Got it — you're out of this match.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                Since you can't play this time, your opponent advances. Thanks for letting us know. Email us at <a href="mailto:hello@couchcup.co.za" style={{ color: 'var(--accent)' }}>hello@couchcup.co.za</a> if this was a mistake.
              </p>
            </>
          )}

          {state.status === 'already_resolved' && (
            <>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Already sorted.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                This match has already been resolved.
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
