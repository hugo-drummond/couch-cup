'use server'

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const resend = new Resend(process.env.RESEND_API_KEY)

const db = () => supabase

async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    })
    const data = await res.json()
    return data.success === true
  } catch {
    return true // don't block on Turnstile errors
  }
}

export async function registerParticipant(data: {
  name: string
  email: string
  mobile: string
  dob: string
  psn_id: string
  discord: string
  turnstileToken: string
}) {
  try {
    if (data.turnstileToken) {
      const valid = await verifyTurnstile(data.turnstileToken)
      if (!valid) return { error: 'captcha' }
    }

    const { error: dbError } = await db().from('participants').insert({
      name: data.name,
      email: data.email,
      mobile: data.mobile || null,
      date_of_birth: data.dob || null,
      psn_id: data.psn_id,
      discord_id: data.discord || null,
      country: 'South Africa',
      status: 'waitlist',
    })

    if (dbError) {
      if (dbError.code === '23505') return { error: 'duplicate' }
      return { error: dbError.message }
    }

    const firstName = data.name.split(' ')[0]

    try {
      await resend.emails.send({
        from: `Couch Cup <${process.env.FROM_EMAIL}>`,
        to: data.email,
        subject: "You're on the list — Couch Cup",
        text: `Hi ${firstName},\n\nThanks for signing up for Couch Cup, South Africa's casual gaming league.\n\nWe'll be announcing the selected competitors shortly on our socials and Discord. Give us a follow or join our Discord to stay tuned.\n\nThanks,\nThe Couch Cup Team`,
        html: `<p>Hi ${firstName},</p><p>Thanks for signing up for Couch Cup, South Africa's casual gaming league.</p><p>We'll be announcing the selected competitors shortly on our socials and Discord. Give us a follow or join our Discord to stay tuned.</p><p>Thanks,<br>The Couch Cup Team</p>`,
      })
    } catch {
      // email failure shouldn't block the signup
    }

    return { success: true }
  } catch (e: any) {
    return { error: e?.message ?? 'Unknown error' }
  }
}
