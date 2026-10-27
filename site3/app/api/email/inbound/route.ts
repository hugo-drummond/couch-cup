import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'

const SUPA_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN!
const PROJECT_REF = 'rnoavvjxiozlyrulffal'

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

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) return NextResponse.json({ error: 'no secret configured' }, { status: 500 })

    const rawBody = await req.text()
    const svixId = req.headers.get('svix-id') ?? ''
    const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
    const svixSignature = req.headers.get('svix-signature') ?? ''

    // Verify signature
    const wh = new Webhook(secret)
    let body: any
    try {
      body = wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      })
    } catch {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    // Resend inbound payload
    const data = body?.data ?? body
    const from: string = data?.from ?? ''
    const subject: string = data?.subject ?? ''
    const emailId: string = data?.email_id ?? ''

    const email_url = emailId ? `https://resend.com/emails/${emailId}` : null
    const reply_url = from ? `mailto:${from}?subject=Re: ${encodeURIComponent(subject)}` : null

    // Match participant by email
    const participantRows = await sql(
      `SELECT id FROM public.participants WHERE lower(email) = lower($1) LIMIT 1`,
      [from]
    )
    const participant_id = Array.isArray(participantRows) && participantRows.length > 0
      ? participantRows[0].id
      : null

    await sql(
      `INSERT INTO public.email_logs (participant_id, email_type, direction, from_email, subject, email_url, reply_url, received_at, status)
       VALUES ($1, 'inbound_reply', 'inbound', $2, $3, $4, $5, NOW(), 'unread')`,
      [participant_id, from, subject, email_url, reply_url]
    )

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
