export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`
}

export function findOverlap(
  a: { date: string; start: number; end: number },
  b: { date: string; start: number; end: number }
): { date: string; start: number; end: number } | null {
  if (a.date !== b.date) return null
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return start < end ? { date: a.date, start, end } : null
}

interface AvailWindow { date: string; start_time: string; end_time: string }

// Returns the slot inside a more-available window that sits closest (in absolute time)
// to any less-available window. Used at the forfeit point so the scheduled time is the
// least unfair to the player being forfeited.
export function closestSchedulableTime(
  moreWindows: AvailWindow[],
  lessWindows: AvailWindow[]
): { date: string; startTime: string } | null {
  if (!moreWindows.length) return null

  const dayAbs = (date: string) => new Date(`${date}T00:00:00Z`).getTime() / 60000
  const absStart = (w: AvailWindow) => dayAbs(w.date) + toMinutes(w.start_time)
  const absEnd = (w: AvailWindow) => dayAbs(w.date) + toMinutes(w.end_time)

  let bestDist = Infinity
  let best: { date: string; startTime: string } | null = null

  for (const m of moreWindows) {
    const mS = absStart(m), mE = absEnd(m)
    if (!lessWindows.length) {
      best = { date: m.date, startTime: m.start_time }
      break
    }
    for (const l of lessWindows) {
      const lS = absStart(l), lE = absEnd(l)
      // closest point of more-window [mS,mE] to less-window [lS,lE]
      let pointAbs: number
      if (mE < lS) pointAbs = mE          // more entirely before less → latest moment we're free
      else if (mS > lE) pointAbs = mS     // more entirely after less → earliest moment we're free
      else pointAbs = Math.min(Math.max(lS, mS), mE) // overlap edge case → clamp
      const dist = pointAbs < lS ? lS - pointAbs : pointAbs > lE ? pointAbs - lE : 0
      if (dist < bestDist) {
        bestDist = dist
        best = { date: m.date, startTime: minutesToTime(pointAbs - dayAbs(m.date)) }
      }
    }
  }
  return best
}

export function suggestTime(
  windowsA: { date: string; start: number; end: number }[],
  windowsB: { date: string; start: number; end: number }[]
): { date: string; minutes: number; gapMinutes: number } | null {
  let bestGap = Infinity
  let best: { date: string; laterStart: number; earlierEnd: number } | null = null
  for (const a of windowsA) {
    for (const b of windowsB) {
      if (a.date !== b.date) continue
      const laterStart = Math.max(a.start, b.start)
      const earlierEnd = Math.min(a.end, b.end)
      const gap = Math.max(0, laterStart - earlierEnd)
      if (gap < bestGap) { bestGap = gap; best = { date: a.date, laterStart, earlierEnd } }
    }
  }
  if (!best) return null
  return { date: best.date, minutes: Math.round((best.earlierEnd + best.laterStart) / 2), gapMinutes: bestGap }
}

// Earliest 30-min slot >= desiredStart, < overlapEnd, that is >= `gap` minutes
// away from every already-taken start. If none free, returns desiredStart (collision unavoidable).
export function staggerStart(
  desiredStart: number,
  overlapEnd: number,
  takenStarts: number[],
  step = 30,
  gap = 30
): number {
  for (let cand = desiredStart; cand < overlapEnd; cand += step) {
    const clash = takenStarts.some((t) => Math.abs(t - cand) < gap)
    if (!clash) return cand
  }
  return desiredStart
}

// Convert a timestamptz ISO string to SAST date + minutes-since-midnight.
export function sastParts(iso: string): { date: string; minutes: number } {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
  const date = `${parts.year}-${parts.month}-${parts.day}`
  let hour = parseInt(parts.hour, 10)
  if (hour === 24) hour = 0
  const minutes = hour * 60 + parseInt(parts.minute, 10)
  return { date, minutes }
}
