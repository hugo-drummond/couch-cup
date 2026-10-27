import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DASHBOARD_KEY = process.env.DASHBOARD_KEY

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  if (!DASHBOARD_KEY || searchParams.get('key') !== DASHBOARD_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await db
    .from('analytics_snapshots')
    .select('*')
    .order('week_start', { ascending: false })
    .limit(52)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data })
}
