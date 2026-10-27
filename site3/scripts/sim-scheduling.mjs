// Dry-run simulator for the match scheduling flow.
// Imports the REAL helpers from lib/scheduling.ts and replays the exact branching
// of availability/route.ts + proposal/route.ts. No DB, no emails sent.
//
//   node scripts/sim-scheduling.mjs
//
import { closestSchedulableTime, suggestTime, findOverlap, toMinutes, minutesToTime } from '../lib/scheduling.ts'

const MAX_GAP = 240 // MAX_SUGGESTION_GAP_MINUTES

// Wide play window covering all test dates (2026-06-20 .. 06-23, SAST)
const PLAY_START = '2026-06-20T00:00:00+02:00'
const PLAY_END   = '2026-06-23T23:59:00+02:00'

const A = { id: 'A', name: 'Player One', email: 'player-one@example.com', psn: 'PlayerOne_PSN' }
const B = { id: 'B', name: 'Player Two',  email: 'player-two@example.com',  psn: 'PlayerTwo_PSN' }

const fmt = iso => new Date(iso).toLocaleString('en-ZA', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Africa/Johannesburg',
})
const toAbs = w => ({ date: w.date, start: toMinutes(w.start), end: toMinutes(w.end) })
const rows = (p, wins) => wins.map(w => ({ player_id: p.id, date: w.date, start_time: w.start, end_time: w.end }))
const totalMin = wins => wins.reduce((s, w) => s + toMinutes(w.end) - toMinutes(w.start), 0)

let emails = []
const send = (to, type, extra = '') => emails.push(`    → ${type.padEnd(18)} to ${to.email.padEnd(22)} ${extra}`)

function schedule(iso) { return iso }

// ---- availability/route.ts logic (both players have submitted) ----
function availabilityResolve(winsA, winsB, declineCount) {
  const absA = winsA.map(toAbs), absB = winsB.map(toAbs)

  // 1. overlap?
  let overlap = null
  for (const a of absA) { for (const b of absB) { const o = findOverlap(a, b); if (o) { overlap = o; break } } if (overlap) break }
  if (overlap) {
    const at = new Date(`${overlap.date}T${minutesToTime(overlap.start)}:00+02:00`).toISOString()
    send(A, 'CONFIRMATION', `@ ${fmt(at)}`)
    send(B, 'CONFIRMATION', `@ ${fmt(at)}`)
    return { status: 'scheduled', declineCount, at }
  }

  // 2. already past one round → FORFEIT POINT
  if (declineCount >= 1) {
    const minA = totalMin(winsA), minB = totalMin(winsB)
    const less = minA <= minB ? A : B
    const more = minA <= minB ? B : A
    const moreW = more === A ? rows(A, winsA) : rows(B, winsB)
    const lessW = less === A ? rows(A, winsA) : rows(B, winsB)
    const slot = closestSchedulableTime(moreW, lessW)
    const at = slot ? new Date(`${slot.date}T${slot.startTime}:00+02:00`).toISOString() : PLAY_START
    send(less, 'FORFEIT_WARNING', `@ ${fmt(at)} (less avail: ${less===A?minA:minB}m)`)
    send(more, 'CONFIRMATION',    `@ ${fmt(at)} (more avail: ${more===A?minA:minB}m)`)
    send({ email: 'admin' }, 'ADMIN_FLAG', `auto-scheduled after escalation`)
    return { status: 'forfeit', declineCount, at }
  }

  // 3. first time, no overlap → suggestion or resubmit
  const sug = suggestTime(absA, absB)
  const sugAt = sug ? new Date(`${sug.date}T${minutesToTime(sug.minutes)}:00+02:00`).toISOString() : null
  const valid = sug && sug.gapMinutes <= MAX_GAP && sugAt >= PLAY_START && sugAt <= PLAY_END
  if (!valid) {
    send(A, 'RESUBMIT'); send(B, 'RESUBMIT')
    if (!sug) send({ email: 'admin' }, 'ADMIN_FLAG', 'different days, no same-day window')
    return { status: 'resubmit', declineCount: 1, at: null } // sendResubmitToBoth sets decline_count=1
  }
  send(A, 'SUGGESTION', `@ ${fmt(sugAt)} (gap ${sug.gapMinutes}m)`)
  send(B, 'SUGGESTION', `@ ${fmt(sugAt)} (gap ${sug.gapMinutes}m)`)
  return { status: 'suggested', declineCount, at: sugAt }
}

// ---- proposal/route.ts decline logic ----
function proposalDecline(winsA, winsB, declineCount, decliner) {
  if (declineCount === 0) {
    send(A, 'RESUBMIT'); send(B, 'RESUBMIT')
    return { status: 'resubmit', declineCount: 1 }
  }
  // 2nd decline (NOTE: unreachable in normal flow — see report)
  const minA = totalMin(winsA), minB = totalMin(winsB)
  const opp = decliner === A ? B : A
  const moreId = minA >= minB ? A : B
  const lessId = minA >= minB ? B : A
  const moreW = moreId === A ? rows(A, winsA) : rows(B, winsB)
  const lessW = lessId === A ? rows(A, winsA) : rows(B, winsB)
  const slot = closestSchedulableTime(moreW, lessW)
  const at = slot ? new Date(`${slot.date}T${slot.startTime}:00+02:00`).toISOString() : PLAY_START
  send(decliner, 'FORFEIT_WARNING', `@ ${fmt(at)} (decliner)`)
  send(opp, 'CONFIRMATION', `@ ${fmt(at)}`)
  send({ email: 'admin' }, 'ADMIN_FLAG', 'double decline')
  return { status: 'forfeit', declineCount, at }
}

function run(title, steps) {
  console.log(`\n━━━ ${title} ━━━`)
  let declineCount = 0
  for (const step of steps) {
    emails = []
    if (step.kind === 'submit') {
      console.log(`  ROUND submit (decline_count in=${declineCount})`)
      console.log(`    A ${A.name}: ${step.A.map(w => `${w.date.slice(5)} ${w.start}-${w.end}`).join(', ')}`)
      console.log(`    B ${B.name}: ${step.B.map(w => `${w.date.slice(5)} ${w.start}-${w.end}`).join(', ')}`)
      const r = availabilityResolve(step.A, step.B, declineCount)
      declineCount = r.declineCount
      console.log(emails.join('\n'))
      console.log(`    => ${r.status}`)
    } else if (step.kind === 'decline') {
      console.log(`  ${step.who.name} DECLINES suggestion (decline_count in=${declineCount})`)
      const r = proposalDecline(step.A, step.B, declineCount, step.who)
      declineCount = r.declineCount
      console.log(emails.join('\n'))
      console.log(`    => ${r.status}`)
    } else if (step.kind === 'accept') {
      console.log(`  BOTH ACCEPT suggestion`)
      send(A, 'CONFIRMATION'); send(B, 'CONFIRMATION')
      console.log(emails.join('\n'))
      console.log(`    => scheduled`)
    }
  }
}

const d20 = '2026-06-20', d21 = '2026-06-21'

run('1. Round1 OVERLAP → both confirmed', [
  { kind: 'submit', A: [{ date: d20, start: '18:00', end: '20:00' }], B: [{ date: d20, start: '19:00', end: '21:00' }] },
])

run('2. Round1 no-overlap CLOSE → suggestion → BOTH ACCEPT', [
  { kind: 'submit', A: [{ date: d20, start: '14:00', end: '16:00' }], B: [{ date: d20, start: '18:00', end: '20:00' }] },
  { kind: 'accept' },
])

run('3. Round1 suggestion → A DECLINES → Round2 OVERLAP', [
  { kind: 'submit', A: [{ date: d20, start: '14:00', end: '16:00' }], B: [{ date: d20, start: '18:00', end: '20:00' }] },
  { kind: 'decline', who: A, A: [{ date: d20, start: '14:00', end: '16:00' }], B: [{ date: d20, start: '18:00', end: '20:00' }] },
  { kind: 'submit', A: [{ date: d21, start: '19:00', end: '21:00' }], B: [{ date: d21, start: '20:00', end: '22:00' }] },
])

run('4. Round1 suggestion → A DECLINES → Round2 STILL no overlap → FORFEIT (closest slot)', [
  { kind: 'submit', A: [{ date: d20, start: '14:00', end: '16:00' }], B: [{ date: d20, start: '18:00', end: '20:00' }] },
  { kind: 'decline', who: A, A: [{ date: d20, start: '14:00', end: '16:00' }], B: [{ date: d20, start: '18:00', end: '20:00' }] },
  // Round2: A gives little (60m late), B gives lots (08-12). less=A → warned, scheduled in B closest to A
  { kind: 'submit', A: [{ date: d20, start: '21:00', end: '22:00' }], B: [{ date: d20, start: '08:00', end: '12:00' }] },
])

run('5. Round1 no-overlap FAR (different days) → resubmit → Round2 no overlap → FORFEIT', [
  { kind: 'submit', A: [{ date: d20, start: '18:00', end: '20:00' }], B: [{ date: d21, start: '18:00', end: '20:00' }] },
  { kind: 'submit', A: [{ date: d20, start: '20:00', end: '22:00' }], B: [{ date: d21, start: '08:00', end: '11:00' }] },
])

run('6. Round1 no-overlap FAR (gap > 240 same day) → resubmit → Round2 OVERLAP', [
  { kind: 'submit', A: [{ date: d20, start: '08:00', end: '09:00' }], B: [{ date: d20, start: '20:00', end: '22:00' }] },
  { kind: 'submit', A: [{ date: d21, start: '18:00', end: '21:00' }], B: [{ date: d21, start: '19:00', end: '20:00' }] },
])

console.log('\n')
