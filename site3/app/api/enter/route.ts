import { NextRequest, NextResponse } from 'next/server'
import { sendPaidEntryConfirmationEmail } from '@/lib/email'

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

    const {
      name, email, mobile, gaming_id, discord_id, country,
      marketing_opt_in, partner_gaming_id, partner_email,
      utm_source, utm_medium, utm_campaign, turnstileToken,
    } = await req.json()

    if (turnstileToken) {
      const valid = await verifyTurnstile(turnstileToken)
      if (!valid) return NextResponse.json({ error: 'captcha' })
    }

    const normalizedEmail = email ? email.trim().toLowerCase() : email
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'missing_email' }, { status: 400 })
    }

    const submittedGamingId = (gaming_id ?? '').trim()
    if (!submittedGamingId) {
      return NextResponse.json({ error: 'missing_username' }, { status: 400 })
    }

    // Upsert player by email so this identity is continuous with the free-entry funnel
    let playerId: string | null = null
    const existingPlayer = await sql(
      `SELECT id FROM public.players WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
      [normalizedEmail]
    )

    if (Array.isArray(existingPlayer) && existingPlayer.length > 0) {
      playerId = existingPlayer[0]?.id
      const updates: string[] = []
      const updateParams: any[] = []
      let paramIdx = 1
      if (name) { updates.push(`name = $${paramIdx++}`); updateParams.push(name) }
      if (discord_id) { updates.push(`discord_id = $${paramIdx++}`); updateParams.push(discord_id) }
      if (mobile) { updates.push(`mobile = $${paramIdx++}`); updateParams.push(mobile) }
      if (country) { updates.push(`country = $${paramIdx++}`); updateParams.push(country) }
      if (marketing_opt_in !== undefined) updates.push(`marketing_opt_in = ${marketing_opt_in ? 'true' : 'false'}`)
      if (updates.length > 0) {
        updateParams.push(normalizedEmail)
        await sql(`UPDATE public.players SET ${updates.join(', ')} WHERE lower(trim(email)) = lower(trim($${paramIdx}))`, updateParams)
      }
    } else {
      try {
        const insertResult = await sql(
          `INSERT INTO public.players (name, email, gaming_id, mobile, discord_id, country, marketing_opt_in)
           VALUES ($1, $2, $3, $4, $5, $6, ${marketing_opt_in ? 'true' : 'false'})
           RETURNING id`,
          [name, normalizedEmail, submittedGamingId, mobile || null, discord_id || null, country || null]
        )
        playerId = Array.isArray(insertResult) && insertResult.length > 0 ? insertResult[0]?.id : null
      } catch {
        const resolvedPlayer = await sql(
          `SELECT id FROM public.players WHERE lower(trim(email)) = lower(trim($1)) OR gaming_id = $2 LIMIT 1`,
          [normalizedEmail, submittedGamingId]
        )
        playerId = Array.isArray(resolvedPlayer) && resolvedPlayer.length > 0 ? resolvedPlayer[0]?.id : null
      }
    }

    if (!playerId) {
      return NextResponse.json({ error: 'player_failed' }, { status: 500 })
    }

    // Dup check: already got a paid-entry lead on this tournament?
    const existingLead = await sql(
      `SELECT pel.id FROM public.paid_entry_leads pel
       JOIN public.players p ON lower(trim(p.email)) = lower(trim($1))
       WHERE pel.email = p.email AND pel.tournament_id = $2 LIMIT 1`,
      [normalizedEmail, S2_TOURNAMENT_ID]
    )
    if (Array.isArray(existingLead) && existingLead.length > 0) {
      return NextResponse.json({ error: 'duplicate' })
    }

    // Partner self-reference checks (same rule as the free-entry form)
    let normalizedPartnerRef: string | null = null
    if (partner_gaming_id) {
      normalizedPartnerRef = partner_gaming_id.trim() || null
      if (normalizedPartnerRef && normalizedPartnerRef.toLowerCase() === submittedGamingId.toLowerCase()) {
        return NextResponse.json({ error: 'partner_self' }, { status: 400 })
      }
    }
    let normalizedPartnerEmail: string | null = null
    if (partner_email) {
      normalizedPartnerEmail = partner_email.trim().toLowerCase() || null
      if (normalizedPartnerEmail && normalizedPartnerEmail === normalizedEmail.toLowerCase()) {
        return NextResponse.json({ error: 'partner_self' }, { status: 400 })
      }
    }
    if (normalizedPartnerRef && !normalizedPartnerEmail) {
      return NextResponse.json({ error: 'partner_email_required' }, { status: 400 })
    }

    await sql(
      `INSERT INTO public.paid_entry_leads
         (tournament_id, name, email, gaming_id, mobile, partner_ref, partner_email, country, marketing_opt_in, utm_source, utm_medium, utm_campaign)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${marketing_opt_in ? 'true' : 'false'}, $9, $10, $11)`,
      [S2_TOURNAMENT_ID, name, normalizedEmail, submittedGamingId, mobile || null, normalizedPartnerRef, normalizedPartnerEmail, country || null, utm_source || null, utm_medium || null, utm_campaign || null]
    )

    const firstName = name?.split(' ')[0] ?? email.split('@')[0]
    try {
      await sendPaidEntryConfirmationEmail(email, firstName)
    } catch { /* email failure doesn't block signup */ }

    return NextResponse.json({ success: true, id: playerId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
