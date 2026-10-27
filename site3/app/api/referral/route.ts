import { NextRequest, NextResponse } from 'next/server'

const SUPA_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN!
const PROJECT_REF = 'rnoavvjxiozlyrulffal'
const REFERRAL_WHITELIST = ['Instagram', 'TikTok', 'Facebook', 'Friend', 'Other']

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

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

export async function POST(req: NextRequest) {
  try {
    const { id, referral } = await req.json()

    if (!id || typeof id !== 'string' || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Invalid participant id' }, { status: 400 })
    }

    if (!referral || !REFERRAL_WHITELIST.includes(referral)) {
      return NextResponse.json({ error: 'Invalid referral source' }, { status: 400 })
    }

    await sql(
      `UPDATE public.players SET referral = $1 WHERE id = $2`,
      [referral, id]
    )

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
