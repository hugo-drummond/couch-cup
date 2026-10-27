'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/* ─── Navbar ───────────────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <header
      className="sticky top-0 z-50 transition-all duration-200"
      style={{ borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--bg)' }} className="absolute inset-0" />
      <div className="relative mx-auto max-w-[1280px] px-6 flex items-center justify-between" style={{ height: 120 }}>
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <Image src="/images/logo-cropped.png" alt="Couch Cup" width={211} height={148} className="object-contain h-[74px] w-auto translate-y-[10px]" />
        </Link>
        <a href="#enter"
          className="text-[14px] font-semibold px-5 py-2.5 rounded-lg transition-all"
          style={{ background: 'var(--accent)', color: '#fff' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dark)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
          Reserve your spot
        </a>
      </div>
    </header>
  )
}

/* ─── Form ─────────────────────────────────────────────────────────────── */
function TurnstileWidget({ onToken }: { onToken: (t: string) => void }) {
  useEffect(() => {
    (window as any).__turnstileCb = (token: string) => onToken(token)
  }, [onToken])
  return (
    <div className="cf-turnstile" data-sitekey="0x4AAAAAADRs9X7p5uzgXyPK" data-theme="light" data-callback="__turnstileCb" style={{ marginTop: 16 }} />
  )
}

const QS = [
  { id: 'name', label: 'Full name', type: 'text', placeholder: 'e.g. John Smith', required: true },
  { id: 'email', label: 'Email address', type: 'email', placeholder: 'you@example.com', required: true },
  { id: 'gaming_id', label: 'Epic Games username', type: 'text', placeholder: 'e.g. CoolGamer123', helper: 'Your in-game username, exactly as others need to find you.', required: true },
  { id: 'partner', label: 'Your duo partner', type: 'partner' as const, helper: "No partner? Skip this — we'll pair you at the draw. If you name one, add their email so we can reach them.", required: false },
]

function inputStyle(compact: boolean) {
  return {
    width: '100%',
    borderBottom: '2px solid var(--ink)',
    background: 'transparent',
    color: 'var(--ink)',
    fontSize: compact ? 16 : 20,
    padding: compact ? '7px 0' : '10px 0',
    outline: 'none',
  } as React.CSSProperties
}

function PaidEntryForm({ compact = false }: { compact?: boolean }) {
  const searchParams = useSearchParams()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [key, setKey] = useState(0)
  const [checks, setChecks] = useState({ age: false, terms: false, indemnity: false, marketing: false })
  const [checkErr, setCheckErr] = useState('')
  const [legalStep, setLegalStep] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [done, setDone] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(d => { if (d.country_name) setAnswers(a => ({ country: d.country_name, ...a })) })
      .catch(() => {})
  }, [])

  const q = QS[Math.min(step, QS.length - 1)]
  const pct = legalStep ? 100 : (step / QS.length) * 100
  useEffect(() => { if (!legalStep) setTimeout(() => ref.current?.focus({ preventScroll: true }), 60) }, [step, legalStep])

  function validate(v: string) {
    if (q.id === 'partner') {
      const pu = answers.partner_gaming_id ?? ''
      const pe = answers.partner_email ?? ''
      if (pu.trim() && !pe.trim()) return "Add your partner's email so we can reach them."
      if (pe && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pe)) return "That doesn't look like a valid email."
      return ''
    }
    if (q.required && !v.trim()) return 'We need this one.'
    if (q.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "That doesn't look like a valid email."
    return ''
  }

  function next() {
    const v = answers[q.id] ?? ''
    const e = validate(v)
    if (e) { setError(e); return }
    setError('')
    if (step < QS.length - 1) { setKey(k => k + 1); setStep(s => s + 1) }
    else setLegalStep(true)
  }

  function back() {
    if (legalStep) { setLegalStep(false); setCheckErr(''); return }
    if (step === 0) return
    setKey(k => k + 1); setStep(s => s - 1); setError('')
  }

  async function submit() {
    if (!checks.age || !checks.terms || !checks.indemnity) { setCheckErr('Please confirm to continue.'); return }
    setSubmitting(true)
    const res = await fetch('/api/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: answers.name ?? '',
        email: answers.email ?? '',
        gaming_id: answers.gaming_id ?? '',
        country: answers.country ?? '',
        partner_gaming_id: answers.partner_gaming_id ?? '',
        partner_email: answers.partner_email ?? '',
        marketing_opt_in: checks.marketing,
        utm_source: searchParams.get('utm_source') ?? '',
        utm_medium: searchParams.get('utm_medium') ?? '',
        utm_campaign: searchParams.get('utm_campaign') ?? '',
        turnstileToken,
      }),
    })
    const result = await res.json()
    setSubmitting(false)
    if (result.error === 'rate_limited') { setCheckErr('Too many attempts. Please try again in an hour.'); return }
    if (result.error === 'captcha') { setCheckErr('Security check failed. Please wait a moment and try again.'); return }
    if (result.error === 'duplicate') { setCheckErr('This email is already registered for the R50 entry.'); return }
    if (result.error) { setCheckErr('Something went wrong. Please try again.'); return }
    setDone(true)
  }

  return (
    <div>
      <div className="h-0.5 rounded-full overflow-hidden mb-8" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>

      {done ? (
        <div className="fade-in">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--ink-light)' }}>You're in!</p>
          <h3 className="text-[20px] font-semibold mb-4" style={{ color: 'var(--ink)' }}>Spot reserved.</h3>
          <p style={{ fontSize: 14, color: 'var(--ink-mid)', lineHeight: 1.6 }}>Check your email — payment instructions for your R50 entry land shortly. If you named a partner, send them this page so they can register too.</p>
        </div>
      ) : legalStep ? (
        <div className="fade-in">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--ink-light)' }}>Almost done</p>
          <h3 className="text-[20px] font-semibold mb-6" style={{ color: 'var(--ink)' }}>Confirm to reserve your spot</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { k: 'age', text: 'I confirm I am 18 or older.', req: true },
              { k: 'terms', text: 'I agree to the Terms and Conditions and Privacy Policy.', req: true },
              { k: 'indemnity', text: 'I acknowledge the Indemnity and Limitation of Liability.', req: true },
              { k: 'marketing', text: 'Send me emails about future Couch Cup tournaments and other promotional material.', req: false },
            ].map(cb => (
              <label key={cb.k} style={{ display: 'flex', gap: 12, cursor: 'pointer', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={checks[cb.k as keyof typeof checks]}
                  onChange={e => setChecks(p => ({ ...p, [cb.k]: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>
                  {cb.text}
                  {!cb.req && <span style={{ color: 'var(--ink-light)', marginLeft: 6 }}>(optional)</span>}
                </span>
              </label>
            ))}
          </div>
          <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--ink-light)', lineHeight: 1.6 }}>
            18+. Random entry, skill-based outcomes. Not gambling — gaming.
          </p>
          {checkErr && <p style={{ marginTop: 12, fontSize: 13, color: '#C0392B' }}>{checkErr}</p>}
          <TurnstileWidget onToken={setTurnstileToken} />
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={submit} disabled={submitting}
              className="font-semibold px-7 py-3 rounded-lg text-[14px] transition-all"
              style={{ background: 'var(--accent)', color: '#fff', opacity: submitting ? 0.7 : 1 }}
              onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = 'var(--accent-dark)' }}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
              {submitting ? 'Submitting…' : 'Reserve your spot — R50'}
            </button>
            <button onClick={back} style={{ fontSize: 13, color: 'var(--ink-light)', cursor: 'pointer' }}>← Back</button>
          </div>
        </div>
      ) : (
        <div key={key}>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--ink-light)' }}>{step + 1} of {QS.length}</p>
          <label style={{ display: 'block', fontSize: compact ? 17 : 22, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
            {q.label}
            {q.required ? <span style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>
              : <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-light)', marginLeft: 8 }}>(optional)</span>}
          </label>
          {q.helper && <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 20 }}>{q.helper}</p>}
          {!q.helper && <div style={{ height: 20 }} />}

          {q.id === 'partner' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 12 }}>Partner's Epic username</p>
                <input ref={ref} type="text" value={answers.partner_gaming_id ?? ''}
                  onChange={e => { setAnswers(a => ({ ...a, partner_gaming_id: e.target.value })); setError('') }}
                  onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
                  placeholder="e.g. PartnerName" style={inputStyle(compact)} />
              </div>
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 12 }}>Partner's email</p>
                <input type="email" value={answers.partner_email ?? ''}
                  onChange={e => { setAnswers(a => ({ ...a, partner_email: e.target.value })); setError('') }}
                  onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
                  placeholder="partner@example.com" style={inputStyle(compact)} />
              </div>
            </div>
          ) : (
            <input ref={ref} type={q.type} value={answers[q.id] ?? ''}
              onChange={e => { setAnswers(a => ({ ...a, [q.id]: e.target.value })); setError('') }}
              onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') next() }}
              placeholder={'placeholder' in q ? q.placeholder : ''}
              style={inputStyle(compact)} />
          )}

          {error && <p style={{ marginTop: 10, fontSize: 13, color: '#C0392B' }}>{error}</p>}

          <div style={{ marginTop: 28, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={next}
              className="font-semibold px-7 py-3 rounded-lg text-[14px] transition-all"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dark)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
              {step === QS.length - 1 ? 'Next' : 'OK'}
              <span style={{ marginLeft: 8, opacity: 0.5, fontSize: 12 }}>Enter ↵</span>
            </button>
            {step > 0 && <button onClick={back} style={{ fontSize: 13, color: 'var(--ink-light)', cursor: 'pointer' }}>← Back</button>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Footer ─────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: 'var(--surface)', color: 'var(--ink)' }} className="py-16">
      <div className="mx-auto max-w-[1280px] px-6">
        <Image src="/images/logo-transparent.png" alt="Couch Cup" width={105} height={72} className="object-contain object-left mb-5" />
        <p style={{ fontSize: 14, color: 'rgba(240,244,248,0.6)', lineHeight: 1.65 }}>South Africa's casual gaming tournament.</p>
        <p style={{ fontSize: 13, color: 'rgba(240,244,248,0.4)', marginTop: 8 }}>Operated by Drummond Holdings (Pty) Ltd</p>
        <div style={{ marginTop: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[['Terms', '/terms'], ['Privacy', '/privacy'], ['Rules', '/rules'], ['Full site', '/']].map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: 13, color: 'rgba(240,244,248,0.6)', textDecoration: 'none' }}>{label}</a>
          ))}
        </div>
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid rgba(244,237,226,0.1)' }}>
          <p style={{ fontSize: 13, color: 'rgba(244,237,226,0.35)' }}>© 2026 Drummond Holdings (Pty) Ltd. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
function EnterPage() {
  return (
    <>
      <Navbar />
      <main>
        <section id="enter" className="scroll-mt-20 hero-bg" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="relative mx-auto max-w-[1280px] px-6 py-10 md:py-20">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_460px] gap-8 md:gap-16 items-center">
              <div>
                <div className="flex items-center gap-2.5 mb-6">
                  <span className="live-dot" />
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    Fortnite Duos · R50 entry · Fri 28 Aug
                  </span>
                </div>
                <h1 className="font-display" style={{ fontSize: 'clamp(46px, 7.5vw, 96px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.03em', lineHeight: 0.95 }}>
                  Pay R50.<br /><em style={{ fontStyle: 'italic', fontWeight: 300 }}>Win <span style={{ color: 'var(--accent)' }}>R500</span> each.</em>
                </h1>
                <p style={{ fontSize: 17, color: 'var(--ink-mid)', lineHeight: 1.65, maxWidth: 460, marginTop: 24 }}>
                  Casual tournament for normal players, not pros. R50 in, real cash out. Last duo standing takes it.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-6">
                  {['R50 entry', 'Duos drawn at random', 'Final streamed live'].map(t => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--ink-light)' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ink-light)' }} />{t}
                    </span>
                  ))}
                </div>

                <div className="mt-12 max-w-[460px]" style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Why does it cost R50?</h2>
                  <p style={{ fontSize: 14, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                    Your entry funds the prize, not ads. It also means everyone who signs up actually shows up, no ghosts, no dead brackets.
                  </p>
                </div>
              </div>

              <div className="self-start w-full">
                <div className="rounded-xl p-6 md:p-8" style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderTop: '3px solid var(--accent)', boxShadow: '0 24px 60px rgba(3,8,18,0.45)',
                }}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--accent)' }}>R50 entry — spots open</p>
                  <p className="font-display" style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, color: 'var(--ink)', marginBottom: 8, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                    Lock in your duo.
                  </p>
                  <p style={{ fontSize: 15, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 24 }}>
                    R50 entry, Fortnite Duos, Friday 28 August. Register solo, bring a partner, or we'll pair you.
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-light)', lineHeight: 1.5, marginBottom: 20 }}>
                    Payment instructions land in your inbox after signup.
                  </p>
                  <PaidEntryForm compact />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

export default function Page() {
  return (
    <Suspense>
      <EnterPage />
    </Suspense>
  )
}
