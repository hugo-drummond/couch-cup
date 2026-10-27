import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import Board from './Board'
import { SPONSOR_COLS } from './types'
import type { Sponsor } from './types'

const ACCESS_KEY = process.env.DASHBOARD_KEY

export const metadata: Metadata = { title: 'CRM — Couch Cup' }

export const dynamic = 'force-dynamic'

export default async function SponsorsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { key } = await searchParams

  if (!ACCESS_KEY || key !== ACCESS_KEY) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A1628]">
        <form method="GET" className="flex flex-col items-center gap-4">
          <p className="text-sm text-white">Enter access key</p>
          <input
            name="key"
            type="password"
            autoFocus
            className="w-64 rounded border border-[#2a3a55] bg-[#162033] px-4 py-2 text-white focus:border-[#DC1430] focus:outline-none"
            placeholder="Key"
          />
          <button
            type="submit"
            className="rounded bg-[#DC1430] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b81027]"
          >
            Enter
          </button>
        </form>
      </div>
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('sponsors')
    .select(SPONSOR_COLS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0A1628]">
        <p className="text-sm text-[#8fa3c0]">Waking up database…</p>
        <meta httpEquiv="refresh" content="3" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <div className="border-b border-[#1e3050] px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Couch Cup — Sponsor CRM</h1>
          <span className="text-xs text-[#8fa3c0]">
            {new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] p-6">
        <Board initial={(data ?? []) as Sponsor[]} />
      </div>
    </div>
  )
}
