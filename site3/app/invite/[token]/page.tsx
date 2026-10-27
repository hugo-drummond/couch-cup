'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

type Action = 'signup' | 'not_interested'
type Phase = 'loading' | 'form' | 'signed_up' | 'not_interested' | 'closed' | 'error'
interface Info { tournamentName: string; game: string; prize: string | null }

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const [action, setAction] = useState<Action>(searchParams.get('action') === 'not_interested' ? 'not_interested' : 'signup')
  const [phase, setPhase] = useState<Phase>('loading')
  const [info, setInfo] = useState<Info | null>(null)
  const [epic, setEpic] = useState('')
  const [partnerEpic, setPartnerEpic] = useState('')
  const [partnerEmail, setPartnerEmail] = useState('')
  const [formErr, setFormErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/tournament/invite?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) return setPhase('error')
        if (!data.open) return setPhase('closed')
        setInfo({ tournamentName: data.tournamentName, game: data.game, prize: data.prize })
        setPhase('form')
      })
      .catch(() => setPhase('error'))
  }, [token])

  async function submit(a: Action) {
    if (a === 'signup') {
      if (!epic.trim()) return
      if (partnerEpic.trim() && !partnerEmail.trim()) { setFormErr("Add your partner's email so we can reach them."); return }
      if (partnerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmail.trim())) { setFormErr("That doesn't look like a valid email."); return }
    }
    setFormErr('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/tournament/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: a,
          epicUsername: a === 'signup' ? epic.trim() : undefined,
          partner_gaming_id: a === 'signup' ? partnerEpic.trim() : undefined,
          partner_email: a === 'signup' ? partnerEmail.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (data.error === 'closed') return setPhase('closed')
      if (data.error === 'partner_email_required') { setFormErr("Add your partner's email so we can reach them."); return }
      if (data.error === 'partner_self') { setFormErr("Your partner can't be you — use their username and email."); return }
      if (data.error) return setPhase('error')
      setPhase(a === 'signup' ? 'signed_up' : 'not_interested')
    } catch {
      setPhase('error')
    } finally {
      setSubmitting(false)
    }
  }

  const btn = (label: string, onClick: () => void, disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled || submitting}
      style={{
        background: 'var(--accent)', color: '#fff',
        padding: '14px 32px', borderRadius: 8,
        fontSize: 16, fontWeight: 700, border: 'none',
        cursor: (disabled || submitting) ? 'not-allowed' : 'pointer',
        opacity: (disabled || submitting) ? 0.55 : 1, transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled && !submitting) e.currentTarget.style.background = 'var(--accent-dark)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
    >
      {label}
    </button>
  )

  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 16, color: 'var(--ink)', background: 'var(--bg)' } as const

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

          {phase === 'loading' && (
            <p style={{ color: 'var(--ink-mid)', fontSize: 16 }}>Loading…</p>
          )}

          {phase === 'form' && info && (
            <>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-light)', marginBottom: 16 }}>
                {info.game}
              </p>
              <h1 className="font-display" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                {action === 'signup' ? `Join ${info.tournamentName}?` : 'Not this one?'}
              </h1>

              {action === 'signup' ? (
                <>
                  <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 8 }}>
                    Free to enter{info.prize ? <>, <strong style={{ color: 'var(--ink)' }}>{info.prize}</strong> for the winning duo</> : null}. Pop in your Epic username and you're on the list.
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, marginBottom: 28 }}>
                    No partner, no problem — unpaired signups are paired.
                  </p>
                  <div style={{ marginBottom: 16, textAlign: 'left' }}>
                    <label htmlFor="epic" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink-mid)', marginBottom: 6 }}>
                      Epic Games username
                    </label>
                    <input
                      id="epic"
                      value={epic}
                      onChange={e => { setEpic(e.target.value); setFormErr('') }}
                      placeholder="e.g. CoolGamer123"
                      autoComplete="off"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: 16, textAlign: 'left' }}>
                    <label htmlFor="partnerEpic" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink-mid)', marginBottom: 6 }}>
                      Partner's Epic username <span style={{ color: 'var(--ink-light)', fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      id="partnerEpic"
                      value={partnerEpic}
                      onChange={e => { setPartnerEpic(e.target.value); setFormErr('') }}
                      placeholder="e.g. PartnerName"
                      autoComplete="off"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: 24, textAlign: 'left' }}>
                    <label htmlFor="partnerEmail" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink-mid)', marginBottom: 6 }}>
                      Partner's email <span style={{ color: 'var(--ink-light)', fontWeight: 400 }}>(needed if you name a partner)</span>
                    </label>
                    <input
                      id="partnerEmail"
                      type="email"
                      value={partnerEmail}
                      onChange={e => { setPartnerEmail(e.target.value); setFormErr('') }}
                      placeholder="partner@example.com"
                      autoComplete="off"
                      style={inputStyle}
                    />
                  </div>
                  {formErr && <p style={{ color: 'var(--accent)', fontSize: 14, marginBottom: 16, textAlign: 'left' }}>{formErr}</p>}
                  {btn(submitting ? 'Signing up…' : "I'm in — sign me up", () => submit('signup'), !epic.trim())}
                </>
              ) : (
                <>
                  <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 40 }}>
                    No problem — we won't email you about <strong style={{ color: 'var(--ink)' }}>{info.tournamentName}</strong> again. You'll still hear about future tournaments.
                  </p>
                  {btn(submitting ? 'Saving…' : "Confirm — don't email me about this one", () => submit('not_interested'))}
                </>
              )}

              <p style={{ marginTop: 24 }}>
                <button
                  onClick={() => setAction(action === 'signup' ? 'not_interested' : 'signup')}
                  disabled={submitting}
                  style={{ background: 'none', border: 'none', color: 'var(--ink-light)', fontSize: 14, textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {action === 'signup' ? 'Not interested in this one' : 'Actually, sign me up'}
                </button>
              </p>
            </>
          )}

          {phase === 'signed_up' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
              <h1 className="font-display" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                You're in.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                We've got your Epic username. We'll email your match details when the bracket goes live.
              </p>
            </>
          )}

          {phase === 'not_interested' && (
            <>
              <h1 className="font-display" style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Got it.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 24 }}>
                You're off the list for this one. Changed your mind?
              </p>
              <button
                onClick={() => { setAction('signup'); setPhase('form') }}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--ink-mid)', padding: '12px 28px', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              >
                Sign me up after all
              </button>
            </>
          )}

          {phase === 'closed' && (
            <>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Signups closed.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                This tournament isn't taking signups right now. Follow us for the next one at <a href="https://couchcup.co.za" style={{ color: 'var(--accent)' }}>couchcup.co.za</a>.
              </p>
            </>
          )}

          {phase === 'error' && (
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
