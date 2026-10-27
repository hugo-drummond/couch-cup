import { NextRequest, NextResponse } from 'next/server'
import { sendWaitlistConfirmationEmail } from '@/lib/email'

// Simple in-memory rate limiter: max 3 attempts per IP per hour
const ipAttempts = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return false
  }
  if (entry.count >= 3) return true
  entry.count++
  return false
}

const SUPA_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN!
const PROJECT_REF = 'rnoavvjxiozlyrulffal'
const S2_TOURNAMENT_ID = '0832e79b-5e75-408d-af7e-ccb598df0d85'

async function sql(query: string, params: any[] = []) {
  // Replace $1, $2 etc with quoted values for simple cases
  let q = query
  params.forEach((p, i) => {
    const val = p === null ? 'NULL' : `'${String(p).replace(/'/g, "''")}'`
    q = q.replace(`$${i + 1}`, val)
  })
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: q }),
  })
  return res.json()
}

async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token }),
    })
    const data = await res.json()
    return data.success === true
  } catch { return true }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const { name, email, mobile, gaming_id, psn_id, discord_id, discord, country, marketing_opt_in, marketing, partner_ref, partner_gaming_id, partner_email, platform_type, turnstileToken } = await req.json()

    if (turnstileToken) {
      const valid = await verifyTurnstile(turnstileToken)
      if (!valid) return NextResponse.json({ error: 'captcha' })
    }

    // Normalize email
    const normalizedEmail = email ? email.trim().toLowerCase() : email
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'missing_email' }, { status: 400 })
    }

    // Determine gaming_id: accept new gaming_id or fallback to legacy psn_id
    const submittedGamingId = (gaming_id?.trim() || psn_id?.trim() || '').trim()
    if (!submittedGamingId) {
      return NextResponse.json({ error: 'missing_username' }, { status: 400 })
    }

    // Resolve discord_id (accept both old "discord" and new "discord_id" names)
    const resolvedDiscordId = discord_id || discord

    // Resolve marketing_opt_in (accept both old "marketing" and new "marketing_opt_in" names)
    const marketingOptIn = marketing_opt_in !== undefined ? marketing_opt_in : marketing

    // Resolve platform (form sends already-resolved platform_type, e.g. "Epic Games ID" or custom "Other" text)
    const resolvedPlatform = platform_type?.trim() || null

    // Resolve partner username (accept new "partner_gaming_id", fall back to legacy "partner_ref")
    const partnerUsername = (partner_gaming_id ?? partner_ref)

    // Upsert player by email: resolve or create
    let playerId: string | null = null

    // First check if player exists by email
    const existingPlayer = await sql(
      `SELECT id FROM public.players WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
      [normalizedEmail]
    )

    if (Array.isArray(existingPlayer) && existingPlayer.length > 0) {
      playerId = existingPlayer[0]?.id
      // UPDATE mutable fields: name, discord_id, mobile, country, marketing_opt_in (only if provided)
      const updates: string[] = []
      const updateParams: any[] = []
      let paramIdx = 1

      if (name) {
        updates.push(`name = $${paramIdx++}`)
        updateParams.push(name)
      }
      if (resolvedDiscordId) {
        updates.push(`discord_id = $${paramIdx++}`)
        updateParams.push(resolvedDiscordId)
      }
      if (mobile) {
        updates.push(`mobile = $${paramIdx++}`)
        updateParams.push(mobile)
      }
      if (country) {
        updates.push(`country = $${paramIdx++}`)
        updateParams.push(country)
      }
      if (resolvedPlatform) {
        updates.push(`platform = $${paramIdx++}`)
        updateParams.push(resolvedPlatform)
      }
      if (marketingOptIn !== undefined && marketingOptIn !== null) {
        updates.push(`marketing_opt_in = ${marketingOptIn ? 'true' : 'false'}`)
      }

      if (updates.length > 0) {
        updateParams.push(normalizedEmail)
        await sql(
          `UPDATE public.players SET ${updates.join(', ')} WHERE lower(trim(email)) = lower(trim($${paramIdx}))`,
          updateParams
        )
      }
    } else {
      // INSERT new player
      try {
        const insertResult = await sql(
          `INSERT INTO public.players (name, email, gaming_id, mobile, discord_id, country, platform, marketing_opt_in)
           VALUES ($1, $2, $3, $4, $5, $6, $7, ${marketingOptIn ? 'true' : 'false'})
           RETURNING id`,
          [name, normalizedEmail, submittedGamingId, mobile || null, resolvedDiscordId || null, country || null, resolvedPlatform]
        )
        playerId = Array.isArray(insertResult) && insertResult.length > 0 ? insertResult[0]?.id : null
      } catch {
        // Conflict on email or gaming_id — re-resolve to existing player
        const resolvedPlayer = await sql(
          `SELECT id FROM public.players
           WHERE lower(trim(email)) = lower(trim($1)) OR gaming_id = $2 LIMIT 1`,
          [normalizedEmail, submittedGamingId]
        )
        playerId = Array.isArray(resolvedPlayer) && resolvedPlayer.length > 0 ? resolvedPlayer[0]?.id : null
      }
    }

    if (!playerId) {
      return NextResponse.json({ error: 'player_failed' }, { status: 500 })
    }

    // Dup check: already in waitlist for S2?
    const existingWaitlist = await sql(
      `SELECT id FROM public.waitlist_entries WHERE player_id = $1 AND tournament_id = $2 LIMIT 1`,
      [playerId, S2_TOURNAMENT_ID]
    )
    if (Array.isArray(existingWaitlist) && existingWaitlist.length > 0) {
      return NextResponse.json({ error: 'duplicate' })
    }

    // Validate partner username: normalize + self-reference check
    let normalizedPartnerRef: string | null = null
    if (partnerUsername) {
      normalizedPartnerRef = partnerUsername.trim() || null
      if (normalizedPartnerRef) {
        const partnerLower = normalizedPartnerRef.toLowerCase()
        if (partnerLower === submittedGamingId.toLowerCase() || partnerLower === normalizedEmail.toLowerCase()) {
          return NextResponse.json({ error: 'partner_self' }, { status: 400 })
        }
      }
    }

    // Validate partner email: normalize + self-reference check
    let normalizedPartnerEmail: string | null = null
    if (partner_email) {
      normalizedPartnerEmail = partner_email.trim().toLowerCase() || null
      if (normalizedPartnerEmail && normalizedPartnerEmail === normalizedEmail.toLowerCase()) {
        return NextResponse.json({ error: 'partner_self' }, { status: 400 })
      }
    }

    // A named partner must include an email — that's our only way to reach them.
    if (normalizedPartnerRef && !normalizedPartnerEmail) {
      return NextResponse.json({ error: 'partner_email_required' }, { status: 400 })
    }

    // INSERT into waitlist_entries
    await sql(
      `INSERT INTO public.waitlist_entries (player_id, tournament_id, gaming_id, status, partner_ref, partner_email)
       VALUES ($1, $2, $3, 'waitlist', $4, $5)
       ON CONFLICT (player_id, tournament_id) DO NOTHING`,
      [playerId, S2_TOURNAMENT_ID, submittedGamingId, normalizedPartnerRef, normalizedPartnerEmail]
    )

    // Send welcome email
    const firstName = name?.split(' ')[0] ?? email.split('@')[0]
    try {
      await sendWaitlistConfirmationEmail(email, firstName)
    } catch { /* email failure doesn't block signup */ }

    return NextResponse.json({ success: true, id: playerId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
