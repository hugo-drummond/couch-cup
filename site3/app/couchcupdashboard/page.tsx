import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import RefreshButton from './RefreshButton'
import { channelLabel } from '@/lib/channel'

const DASHBOARD_KEY = process.env.DASHBOARD_KEY

export const metadata: Metadata = { title: 'Analytics — Couch Cup' }

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

type Participant = {
  id: string
  name: string
  email: string
  mobile: string | null
  date_of_birth: string | null
  psn_id: string
  discord_id: string | null
  country: string | null
  referral_source: string | null
  status: string
  marketing_consent: boolean
  signup_ip: string | null
  created_at: string
}

type Snapshot = {
  id: string
  source: string
  week_start: string
  data: Record<string, unknown>
  fetched_at: string
}

type GA4Data = {
  sessions: number
  conversions: number
  totalUsers: number
  newUsers: number
  conversionRate: string
}

type MetaAdsData = {
  spend: string
  impressions: string
  clicks: string
  cpm: string
  cpc: string
  ctr: string
  actions: Array<{ action_type: string; value: string }>
  costPerAction: Array<{ action_type: string; value: string }>
}

type OrgPost = {
  id: string
  type: string
  timestamp: string
  caption: string
  reach: number
  impressions: number
  likes: number
  comments: number
  shares: number
  saved: number
  videoViews: number | null
  watchRatePct: string | null
  avgWatchSec: string | null
  error?: boolean
  errorDetail?: string
}

type MetaOrganicData = {
  posts: OrgPost[]
}

function Bar({ value, max, color = '#DC1430' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full bg-[#0f1e35] rounded h-1.5 mt-1">
      <div className="h-1.5 rounded" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[#0f1e35] border border-[#1e3050] rounded-lg p-4">
      <p className="text-[#8fa3c0] text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-[#8fa3c0] text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; tab?: string }>
}) {
  const params = await searchParams
  const key = params.key
  const tab = params.tab ?? 'signups'

  if (!DASHBOARD_KEY || key !== DASHBOARD_KEY) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <form method="GET" className="flex flex-col gap-4 items-center">
          <p className="text-white text-sm">Enter access key</p>
          <input
            name="key"
            type="password"
            autoFocus
            className="bg-[#162033] border border-[#2a3a55] text-white rounded px-4 py-2 w-64 focus:outline-none focus:border-[#DC1430]"
            placeholder="Key"
          />
          <button
            type="submit"
            className="bg-[#DC1430] text-white text-sm font-semibold px-6 py-2 rounded hover:bg-[#b81027] transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    )
  }

  const supabase = getSupabase()

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header */}
      <div className="border-b border-[#1e3050] px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Couch Cup — Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#8fa3c0]">
              {new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST
            </span>
            <RefreshButton dashKey={key} />
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-[1400px] mx-auto flex gap-1 mt-4">
          {[
            { id: 'signups', label: 'Signups' },
            { id: 'ga4', label: 'Google Analytics' },
            { id: 'meta_ads', label: 'Meta Ads' },
            { id: 'meta_organic', label: 'Organic' },
          ].map((t) => (
            <a
              key={t.id}
              href={`?key=${key}&tab=${t.id}`}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-[#DC1430] text-white'
                  : 'text-[#8fa3c0] hover:text-white hover:bg-[#1e3050]'
              }`}
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-6">
        {tab === 'signups' && <SignupsTab supabase={supabase} />}
        {tab === 'ga4' && <GA4Tab supabase={supabase} dashKey={key} />}
        {tab === 'meta_ads' && <MetaAdsTab supabase={supabase} dashKey={key} />}
        {tab === 'meta_organic' && <MetaOrganicTab supabase={supabase} dashKey={key} />}
      </div>
    </div>
  )
}

async function SignupsTab({ supabase }: { supabase: ReturnType<typeof getSupabase> }) {
  const { data: participants, error } = await supabase
    .from('participants')
    .select('id, name, email, mobile, date_of_birth, psn_id, discord_id, country, referral_source, status, marketing_consent, signup_ip, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="flex items-center justify-center flex-col gap-3 py-20">
        <p className="text-[#8fa3c0] text-sm">Waking up database…</p>
        <meta httpEquiv="refresh" content="3" />
      </div>
    )
  }

  const rows = (participants ?? []) as Participant[]

  // Channels live on players.youtube_url (linked to participants by email).
  const { data: playersData } = await supabase.from('players').select('email, youtube_url')
  const channelByEmail = new Map(
    (playersData ?? [])
      .filter((pl: { email: string | null; youtube_url: string | null }) => pl.email && pl.youtube_url)
      .map((pl: { email: string | null; youtube_url: string | null }) => [pl.email!.toLowerCase(), pl.youtube_url!])
  )

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-[#8fa3c0] text-sm">{rows.length} registered</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[#8fa3c0] text-sm">No signups yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#1e3050]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0f1e35] text-[#8fa3c0] text-xs uppercase tracking-wider">
                <th className="px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Name</th>
                <th className="px-3 py-3 text-left">Email</th>
                <th className="px-3 py-3 text-left">Mobile</th>
                <th className="px-3 py-3 text-left">PSN ID</th>
                <th className="px-3 py-3 text-left">Discord ID</th>
                <th className="px-3 py-3 text-left">Channel</th>
                <th className="px-3 py-3 text-left">DOB</th>
                <th className="px-3 py-3 text-left">Country</th>
                <th className="px-3 py-3 text-left">Referral</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-left">Mktg</th>
                <th className="px-3 py-3 text-left">IP</th>
                <th className="px-3 py-3 text-left">Signed Up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr
                  key={p.id}
                  className="border-t border-[#1e3050] hover:bg-[#0f1e35] transition-colors"
                >
                  <td className="px-3 py-2.5 text-[#8fa3c0]">{rows.length - i}</td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{p.name}</td>
                  <td className="px-3 py-2.5 text-[#a0b8d8]">{p.email}</td>
                  <td className="px-3 py-2.5 text-[#a0b8d8] whitespace-nowrap">{p.mobile ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-[#DC1430]">{p.psn_id}</td>
                  <td className="px-3 py-2.5 font-mono text-[#a0b8d8]">{p.discord_id ?? '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {channelByEmail.get(p.email.toLowerCase()) ? (
                      <a
                        href={channelByEmail.get(p.email.toLowerCase())!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#a0b8d8] underline"
                      >
                        {channelLabel(channelByEmail.get(p.email.toLowerCase()))}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[#a0b8d8] whitespace-nowrap">
                    {p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString('en-ZA') : '—'}
                  </td>
                  <td className="px-3 py-2.5">{p.country ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[#8fa3c0]">{p.referral_source ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        p.status === 'confirmed'
                          ? 'bg-green-900 text-green-300'
                          : p.status === 'waitlist'
                          ? 'bg-yellow-900 text-yellow-300'
                          : 'bg-[#1e3050] text-[#8fa3c0]'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">{p.marketing_consent ? '✓' : '✗'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[#8fa3c0]">{p.signup_ip ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[#8fa3c0] whitespace-nowrap text-xs">
                    {new Date(p.created_at).toLocaleString('en-ZA', {
                      timeZone: 'Africa/Johannesburg',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

async function GA4Tab({ supabase, dashKey }: { supabase: ReturnType<typeof getSupabase>; dashKey: string }) {
  const { data } = await supabase
    .from('analytics_snapshots')
    .select('*')
    .eq('source', 'ga4')
    .order('week_start', { ascending: false })
    .limit(12)

  const snapshots = (data ?? []) as Snapshot[]
  const latest = snapshots[0]?.data as GA4Data | undefined

  if (!latest) {
    return <EmptyState dashKey={dashKey} />
  }

  const maxConversions = Math.max(...snapshots.map((s) => (s.data as GA4Data).conversions ?? 0), 1)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Conversion Rate" value={`${latest.conversionRate}%`} sub="last 7 days" />
        <StatCard label="Conversions" value={latest.conversions} sub="last 7 days" />
        <StatCard label="Sessions" value={latest.sessions.toLocaleString()} sub="last 7 days" />
        <StatCard label="New Users" value={latest.newUsers.toLocaleString()} sub="last 7 days" />
      </div>

      <div className="bg-[#0f1e35] border border-[#1e3050] rounded-lg p-4">
        <p className="text-[#8fa3c0] text-xs uppercase tracking-wider mb-4">Conversions by week</p>
        <div className="space-y-3">
          {snapshots.map((s) => {
            const d = s.data as GA4Data
            return (
              <div key={s.id}>
                <div className="flex justify-between text-xs text-[#8fa3c0] mb-1">
                  <span>{s.week_start}</span>
                  <span>{d.conversions} conversions · {d.conversionRate}% rate</span>
                </div>
                <Bar value={d.conversions} max={maxConversions} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

async function MetaAdsTab({ supabase, dashKey }: { supabase: ReturnType<typeof getSupabase>; dashKey: string }) {
  const { data } = await supabase
    .from('analytics_snapshots')
    .select('*')
    .eq('source', 'meta_ads')
    .order('week_start', { ascending: false })
    .limit(12)

  const snapshots = (data ?? []) as Snapshot[]
  const latest = snapshots[0]?.data as MetaAdsData | undefined

  if (!latest) {
    return <EmptyState dashKey={dashKey} />
  }

  const maxSpend = Math.max(...snapshots.map((s) => parseFloat((s.data as MetaAdsData).spend ?? '0')), 1)

  const profileVisitCost = latest.costPerAction?.find(
    (a) => a.action_type === 'link_click' || a.action_type === 'profile_visit'
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Spend" value={`R${parseFloat(latest.spend).toFixed(2)}`} sub="last 7 days" />
        <StatCard label="Clicks" value={parseInt(latest.clicks).toLocaleString()} sub="last 7 days" />
        <StatCard label="CPM" value={`R${parseFloat(latest.cpm).toFixed(2)}`} sub="per 1k impressions" />
        <StatCard label="CPC" value={`R${parseFloat(latest.cpc).toFixed(2)}`} sub="per click" />
      </div>

      {profileVisitCost && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Cost per Result"
            value={`R${parseFloat(profileVisitCost.value).toFixed(2)}`}
            sub={profileVisitCost.action_type.replace(/_/g, ' ')}
          />
          <StatCard label="CTR" value={`${parseFloat(latest.ctr).toFixed(2)}%`} sub="click-through rate" />
          <StatCard label="Impressions" value={parseInt(latest.impressions).toLocaleString()} sub="last 7 days" />
        </div>
      )}

      {latest.actions && latest.actions.length > 0 && (
        <div className="bg-[#0f1e35] border border-[#1e3050] rounded-lg p-4">
          <p className="text-[#8fa3c0] text-xs uppercase tracking-wider mb-4">Actions breakdown</p>
          <div className="space-y-2">
            {latest.actions.map((a) => (
              <div key={a.action_type} className="flex justify-between text-sm">
                <span className="text-[#8fa3c0]">{a.action_type.replace(/_/g, ' ')}</span>
                <span className="text-white font-medium">{a.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#0f1e35] border border-[#1e3050] rounded-lg p-4">
        <p className="text-[#8fa3c0] text-xs uppercase tracking-wider mb-4">Spend by week</p>
        <div className="space-y-3">
          {snapshots.map((s) => {
            const d = s.data as MetaAdsData
            const spend = parseFloat(d.spend ?? '0')
            return (
              <div key={s.id}>
                <div className="flex justify-between text-xs text-[#8fa3c0] mb-1">
                  <span>{s.week_start}</span>
                  <span>R{spend.toFixed(2)}</span>
                </div>
                <Bar value={spend} max={maxSpend} color="#f59e0b" />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

async function MetaOrganicTab({ supabase, dashKey }: { supabase: ReturnType<typeof getSupabase>; dashKey: string }) {
  const { data } = await supabase
    .from('analytics_snapshots')
    .select('*')
    .eq('source', 'meta_organic')
    .order('week_start', { ascending: false })
    .limit(1)

  const latest = data?.[0]?.data as MetaOrganicData | undefined

  if (!latest) {
    return <EmptyState dashKey={dashKey} />
  }

  const posts = latest.posts ?? []
  const maxReach = Math.max(...posts.map((p) => p.reach ?? 0), 1)
  const videoPosts = posts.filter((p) => p.watchRatePct !== null)

  return (
    <div className="space-y-6">
      {videoPosts.length > 0 && (
        <div className="bg-[#0f1e35] border border-[#1e3050] rounded-lg p-4">
          <p className="text-[#8fa3c0] text-xs uppercase tracking-wider mb-4">Video performance</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#8fa3c0] text-xs uppercase tracking-wider">
                  <th className="text-left pb-3 pr-4">Post</th>
                  <th className="text-right pb-3 pr-4">Reach</th>
                  <th className="text-right pb-3 pr-4">Views</th>
                  <th className="text-right pb-3 pr-4">Watch rate</th>
                  <th className="text-right pb-3">Avg watch</th>
                </tr>
              </thead>
              <tbody>
                {videoPosts.map((p) => (
                  <tr key={p.id} className="border-t border-[#162033]">
                    <td className="py-2.5 pr-4 text-[#8fa3c0] text-xs max-w-[200px] truncate">
                      {p.caption || p.type}
                    </td>
                    <td className="py-2.5 pr-4 text-right">{p.reach.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-right">{(p.videoViews ?? 0).toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className={parseFloat(p.watchRatePct ?? '0') >= 50 ? 'text-green-400' : 'text-[#DC1430]'}>
                        {p.watchRatePct}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[#a0b8d8]">
                      {p.avgWatchSec ? `${p.avgWatchSec}s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-[#0f1e35] border border-[#1e3050] rounded-lg p-4">
        <p className="text-[#8fa3c0] text-xs uppercase tracking-wider mb-4">All posts — reach</p>
        <div className="space-y-4">
          {posts.map((p) => (
            <div key={p.id}>
              <div className="flex justify-between text-xs text-[#8fa3c0] mb-1">
                <span className="truncate max-w-[60%]">{p.caption || p.type} · {new Date(p.timestamp).toLocaleDateString('en-ZA')}</span>
                {p.error
                  ? <span className="text-[#DC1430] truncate max-w-[50%]" title={p.errorDetail}>insights error{p.errorDetail ? `: ${p.errorDetail}` : ''}</span>
                  : <span>{p.reach.toLocaleString()} reach · {p.likes} ♥ · {p.comments} 💬 · {p.shares} ↗</span>
                }
              </div>
              <Bar value={p.reach} max={maxReach} color="#6366f1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ dashKey }: { dashKey: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-[#8fa3c0] text-sm">No data yet. Trigger a snapshot to populate.</p>
      <RefreshButton dashKey={dashKey} />
    </div>
  )
}
