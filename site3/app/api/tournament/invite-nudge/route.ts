import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/supabase'
import { sendTournamentInviteEmail } from '@/lib/email'
import { signInviteToken } from '@/lib/invite-tokens'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * tournament-invite-nudge — weekly pg_cron job.
 * Re-emails the marketing opt-in list (participants ∪ players, marketing_opt_in)
 * MINUS anyone who already has a waitlist_entries row for the open tournament.
 * Auto-stops once the tournament leaves 'registration' (e.g. flips to 'active').
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Overlap guard (auto-expires after 10 min; fail open if lock table unreachable).
  let gotLock = true
  try {
    const lock = await sql<{ id: string }>(
      `UPDATE public.cron_lock
       SET locked_at = now(), expires_at = now() + interval '10 minutes'
       WHERE id = 'invite-nudge' AND (expires_at IS NULL OR expires_at < now())
       RETURNING id`
    )
    gotLock = lock.length > 0
  } catch {
    // fail open
  }
  if (!gotLock) return NextResponse.json({ skipped: 'another tick is running' })

  try {
    const tours = await sql<{ id: string; name: string; game: string; prize: string }>(
      `SELECT id, name, game, prize FROM public.tournaments
       WHERE status = 'registration' ORDER BY created_at DESC LIMIT 1`
    )
    const tour = tours[0]
    if (!tour) return NextResponse.json({ skipped: 'no open tournament' })

    const rows = await sql<{ email: string; name: string }>(
      `SELECT r.email, r.name FROM (
         SELECT DISTINCT email, name FROM public.participants WHERE marketing_opt_in = true
         UNION
         SELECT DISTINCT email, name FROM public.players WHERE marketing_opt_in = true
       ) r
       WHERE NOT EXISTS (
         SELECT 1 FROM public.waitlist_entries we
         JOIN public.players p ON p.id = we.player_id
         WHERE we.tournament_id = $1
           AND lower(trim(p.email)) = lower(trim(r.email))
       )`,
      [tour.id]
    )

    // Dedupe by lowercased email (UNION can return the same email twice).
    const byKey = new Map<string, { email: string; name: string }>()
    for (const r of rows) {
      const key = (r.email || '').toLowerCase().trim()
      if (!key || byKey.has(key)) continue
      byKey.set(key, { email: r.email.trim(), name: r.name || '' })
    }

    let sent = 0
    const failures: string[] = []
    for (const r of byKey.values()) {
      const firstName = (r.name || '').trim().split(/\s+/)[0] || 'there'
      try {
        const token = signInviteToken(r.email, tour.id)
        await sendTournamentInviteEmail(r.email, firstName, token, { name: tour.name, game: tour.game, prize: tour.prize })
        sent++
      } catch (e: any) {
        failures.push(`${r.email}: ${e.message}`)
      }
      await sleep(150)
    }

    return NextResponse.json({ tournament: tour.name, candidates: byKey.size, sent, failures })
  } finally {
    // Release the lock so the next weekly tick can run immediately.
    try {
      await sql(`UPDATE public.cron_lock SET expires_at = now() WHERE id = 'invite-nudge'`)
    } catch {
      // ignore
    }
  }
}
