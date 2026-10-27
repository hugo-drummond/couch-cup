'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

type State =
  | { status: 'loading' }
  | { status: 'accepted_waiting' }
  | { status: 'accepted_scheduled' }
  | { status: 'declined' }
  | { status: 'already_used' }
  | { status: 'expired' }
  | { status: 'error' }

export default function ProposalPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    fetch('/api/tournament/proposal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error === 'already_used') return setState({ status: 'already_used' })
        if (data.error === 'expired') return setState({ status: 'expired' })
        if (data.error) return setState({ status: 'error' })
        if (data.action === 'declined') return setState({ status: 'declined' })
        if (data.status === 'scheduled') return setState({ status: 'accepted_scheduled' })
        setState({ status: 'accepted_waiting' })
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

          {state.status === 'accepted_waiting' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                You're in.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                Waiting for your opponent to confirm. We'll send your match details by email once they respond.
              </p>
            </>
          )}

          {state.status === 'accepted_scheduled' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Match confirmed.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                Both players confirmed. Check your email for the full match details and instructions.
              </p>
            </>
          )}

          {state.status === 'declined' && (
            <>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Got it.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                We've sent you both a link to submit more availability. Check your email.
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
