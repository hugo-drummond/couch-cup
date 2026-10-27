'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

type Slot = { start: string; end: string }
type DayWindow = { slots: Slot[]; skip: boolean }

// HH:MM in SAST from a UTC ISO string
function toSASTTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' })
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; playerName: string; opponentPsn: string; expiresAt: string; playDays: string[]; windowLabel: string; firstDay: string; lastDay: string; windowStartTime: string; windowEndTime: string; hasYoutube: boolean }
  | { status: 'final'; opponentPsn: string; matchTime: string }
  | { status: 'submitted' }
  | { status: 'already_used' }
  | { status: 'expired' }
  | { status: 'error' }

function getDaysBetween(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start)
  const last = new Date(end)
  while (cur <= last) {
    days.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function formatDayLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg',
  })
}

function formatWindowLabel(start: string, end: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Africa/Johannesburg',
  })
  return `${fmt(start)} – ${fmt(end)}`
}

export default function AvailabilityPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [windows, setWindows] = useState<Record<string, DayWindow>>({})
  const [youtubeUrl, setYoutubeUrl] = useState('')

  useEffect(() => {
    fetch(`/api/tournament/match/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error === 'already_used') return setState({ status: 'already_used' })
        if (data.error === 'expired') return setState({ status: 'expired' })
        if (data.error) return setState({ status: 'error' })
        if (data.type !== 'scheduling') return setState({ status: 'error' })
        if (data.roundName === 'Final' && data.playWindowStart) {
          const matchTime = new Date(data.playWindowStart).toLocaleString('en-ZA', {
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
            hour12: false, timeZone: 'Africa/Johannesburg',
          })
          return setState({ status: 'final', opponentPsn: data.opponentPsn, matchTime })
        }
        const playDays = data.playWindowStart && data.playWindowEnd
          ? getDaysBetween(data.playWindowStart, data.playWindowEnd)
          : []
        const windowLabel = data.playWindowStart && data.playWindowEnd
          ? formatWindowLabel(data.playWindowStart, data.playWindowEnd)
          : ''
        const init: Record<string, DayWindow> = {}
        playDays.forEach(d => { init[d] = { slots: [{ start: '', end: '' }], skip: false } })
        setWindows(init)
        const firstDay = playDays[0] ?? ''
        const lastDay = playDays[playDays.length - 1] ?? ''
        setState({
          status: 'ready', playerName: data.playerName, opponentPsn: data.opponentPsn,
          expiresAt: data.expiresAt, playDays, windowLabel, firstDay, lastDay,
          windowStartTime: data.playWindowStart ? toSASTTime(data.playWindowStart) : '00:00',
          windowEndTime: data.playWindowEnd ? toSASTTime(data.playWindowEnd) : '23:59',
          hasYoutube: !!data.hasYoutube,
        })
      })
      .catch(() => setState({ status: 'error' }))
  }, [token])

  function updateSlot(date: string, i: number, field: 'start' | 'end', value: string) {
    setWindows(prev => {
      const slots = [...prev[date].slots]
      slots[i] = { ...slots[i], [field]: value }
      return { ...prev, [date]: { ...prev[date], slots } }
    })
  }

  function addSlot(date: string) {
    setWindows(prev => ({
      ...prev,
      [date]: { ...prev[date], slots: [...prev[date].slots, { start: '', end: '' }] },
    }))
  }

  function removeSlot(date: string, i: number) {
    setWindows(prev => {
      const slots = prev[date].slots.filter((_, idx) => idx !== i)
      return { ...prev, [date]: { ...prev[date], slots: slots.length ? slots : [{ start: '', end: '' }] } }
    })
  }

  function toggleSkip(date: string, skip: boolean) {
    setWindows(prev => ({ ...prev, [date]: { ...prev[date], skip } }))
  }

  async function submit() {
    setFieldError('')
    if (state.status !== 'ready') return

    const activeDays = state.playDays.filter(d => !windows[d]?.skip)
    if (!activeDays.length) {
      setFieldError("Select at least one day you're available.")
      return
    }

    const payload: { date: string; startTime: string; endTime: string }[] = []
    for (const d of activeDays) {
      for (const slot of windows[d].slots) {
        if (!slot.start || !slot.end) { setFieldError('Fill in times for each slot.'); return }
        if (slot.start >= slot.end) { setFieldError('End time must be after start time.'); return }
        payload.push({ date: d, startTime: slot.start, endTime: slot.end })
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/tournament/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, windows: payload, youtubeUrl: youtubeUrl.trim() || undefined }),
      })
      const data = await res.json()
      if (data.error === 'already_used' || data.error === 'already_submitted') return setState({ status: 'already_used' })
      if (data.error === 'expired' || data.error === 'not_found') return setState({ status: 'expired' })
      if (data.error === 'time_outside_window') { setFieldError('One or more times fall outside the match window. Check your times and try again.'); return }
      if (data.error === 'time_outside_allowed_hours') { setFieldError('Matches can only be played 18:00–23:00 on weekdays and 08:00–24:00 on weekends. Adjust your times and try again.'); return }
      if (data.error) return setState({ status: 'error' })
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
                Match Scheduling
              </p>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 12 }}>
                When are you free?
              </h1>
              <p style={{ fontSize: 16, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: state.windowLabel ? 12 : 32 }}>
                Hi {state.playerName.split(' ')[0]}, set your available times to play <strong style={{ color: 'var(--ink)' }}>{state.opponentPsn}</strong>. Toggle off any day you can't play.
              </p>

              {state.windowLabel && (
                <div style={{ background: 'rgba(219,18,48,0.08)', border: '1px solid rgba(219,18,48,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: 'var(--ink-mid)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Match window: </span>{state.windowLabel}
                </div>
              )}

              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 28, fontSize: 13, color: 'var(--ink-mid)', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Playable hours: </span>
                Weekdays 18:00–23:00, weekends 08:00–24:00. Times outside these hours won't be accepted.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {state.playDays.map(date => {
                  const w = windows[date] ?? { slots: [{ start: '', end: '' }], skip: false }
                  return (
                    <div key={date} style={{ borderRadius: 10, border: '1px solid var(--border)', padding: '16px 18px', opacity: w.skip ? 0.45 : 1, transition: 'opacity 0.15s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: w.skip ? 0 : 16 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{formatDayLabel(date)}</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--ink-mid)', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={w.skip}
                            onChange={e => toggleSkip(date, e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                          Can't play
                        </label>
                      </div>

                      {!w.skip && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {w.slots.map((slot, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                              <div style={{ flex: 1 }}>
                                {i === 0 && <label style={labelStyle}>From</label>}
                                <input
                                  type="time" value={slot.start}
                                  onChange={e => updateSlot(date, i, 'start', e.target.value)}
                                  min={state.status === 'ready' && date === state.firstDay ? state.windowStartTime : undefined}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                {i === 0 && <label style={labelStyle}>To</label>}
                                <input
                                  type="time" value={slot.end}
                                  onChange={e => updateSlot(date, i, 'end', e.target.value)}
                                  max={state.status === 'ready' && date === state.lastDay ? state.windowEndTime : undefined}
                                  style={inputStyle}
                                />
                              </div>
                              {w.slots.length > 1 && (
                                <button
                                  onClick={() => removeSlot(date, i)}
                                  style={{ padding: '12px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink-light)', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => addSlot(date)}
                            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--ink-mid)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                          >
                            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add time slot
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {state.status === 'ready' && !state.hasYoutube && (
                <div style={{ marginTop: 24 }}>
                  <label style={labelStyle}>YouTube or Twitch channel URL (optional)</label>
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://youtube.com/@yourchannel or https://twitch.tv/yourchannel"
                    value={youtubeUrl}
                    onChange={e => setYoutubeUrl(e.target.value)}
                    style={inputStyle}
                  />
                  <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 8, lineHeight: 1.5 }}>
                    We'd love to stream your match to build hype around Couch Cup. If you're happy for us to stream from your channel, drop your YouTube or Twitch link here. Totally optional.
                  </p>
                </div>
              )}

              {fieldError && (
                <p style={{ color: '#db1230', fontSize: 14, marginTop: 12 }}>{fieldError}</p>
              )}

              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  marginTop: 28,
                  width: '100%',
                  background: 'var(--accent)',
                  color: '#fff',
                  padding: '14px 24px',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 700,
                  border: 'none',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = 'var(--accent-dark)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
              >
                {submitting ? 'Submitting…' : 'Submit Availability'}
              </button>

              <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 16, textAlign: 'center' }}>
                Link expires {new Date(state.expiresAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' })}
              </p>
            </>
          )}

          {state.status === 'final' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-light)', marginBottom: 16 }}>
                The Final
              </p>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                You're in the Final.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 24 }}>
                vs <strong style={{ color: 'var(--ink)' }}>{state.opponentPsn}</strong>
              </p>
              <div style={{ background: 'rgba(219,18,48,0.08)', border: '1px solid rgba(219,18,48,0.2)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-mid)', margin: '0 0 6px' }}>Match time</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>{state.matchTime}</p>
              </div>
              <p style={{ fontSize: 15, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                Check your email for your score submission link. You'll need it after the match.
              </p>
            </div>
          )}

          {state.status === 'submitted' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 16 }}>
                Got it.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                We'll confirm your match time by email once your opponent submits their availability.
              </p>
            </div>
          )}

          {state.status === 'already_used' && (
            <div style={{ textAlign: 'center' }}>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Already submitted.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                You've already submitted your availability for this match.
              </p>
            </div>
          )}

          {state.status === 'expired' && (
            <div style={{ textAlign: 'center' }}>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Link expired.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                This link is no longer valid. Email us at <a href="mailto:hello@couchcup.co.za" style={{ color: 'var(--accent)' }}>hello@couchcup.co.za</a> if you think this is a mistake.
              </p>
            </div>
          )}

          {state.status === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Something went wrong.
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-mid)' }}>
                Email us at <a href="mailto:hello@couchcup.co.za" style={{ color: 'var(--accent)' }}>hello@couchcup.co.za</a> and we'll sort it out.
              </p>
            </div>
          )}

        </div>
      </main>
    </>
  )
}
