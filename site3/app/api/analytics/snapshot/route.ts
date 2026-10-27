import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const DASHBOARD_KEY = process.env.DASHBOARD_KEY

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Get Monday of the current week
function weekStart(): string {
  const d = new Date()
  const day = d.getUTCDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().split('T')[0]
}

async function getGA4AccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GA4_CLIENT_ID!,
      client_secret: process.env.GA4_CLIENT_SECRET!,
      refresh_token: process.env.GA4_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`GA4 token error: ${JSON.stringify(json)}`)
  return json.access_token
}

async function fetchGA4(): Promise<object> {
  const token = await getGA4AccessToken()
  const propertyId = process.env.GA4_PROPERTY_ID!

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'conversions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
        ],
      }),
    }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`GA4 report error: ${JSON.stringify(json)}`)

  const row = json.rows?.[0]?.metricValues ?? []
  return {
    sessions: parseInt(row[0]?.value ?? '0'),
    conversions: parseInt(row[1]?.value ?? '0'),
    totalUsers: parseInt(row[2]?.value ?? '0'),
    newUsers: parseInt(row[3]?.value ?? '0'),
    conversionRate: row[0]?.value && row[1]?.value
      ? ((parseInt(row[1].value) / parseInt(row[0].value)) * 100).toFixed(2)
      : '0',
  }
}

async function fetchMetaAds(): Promise<object> {
  const token = process.env.META_ACCESS_TOKEN!
  const adAccountId = process.env.META_AD_ACCOUNT_ID!

  const fields = [
    'spend', 'impressions', 'clicks', 'cpm', 'cpc', 'ctr',
    'actions', 'cost_per_action_type',
  ].join(',')

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${adAccountId}/insights?` +
    new URLSearchParams({
      fields,
      date_preset: 'last_7d',
      access_token: token,
    })
  )
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(`Meta Ads error: ${JSON.stringify(json)}`)

  const d = json.data?.[0] ?? {}
  return {
    spend: d.spend ?? '0',
    impressions: d.impressions ?? '0',
    clicks: d.clicks ?? '0',
    cpm: d.cpm ?? '0',
    cpc: d.cpc ?? '0',
    ctr: d.ctr ?? '0',
    actions: d.actions ?? [],
    costPerAction: d.cost_per_action_type ?? [],
  }
}

async function fetchMetaOrganic(): Promise<object> {
  const token = process.env.META_ACCESS_TOKEN!
  const igId = process.env.META_INSTAGRAM_ID!

  // Get recent media (last 10 posts)
  const mediaRes = await fetch(
    `https://graph.facebook.com/v25.0/${igId}/media?` +
    new URLSearchParams({
      fields: 'id,media_type,timestamp,caption,like_count,comments_count',
      limit: '10',
      access_token: token,
    })
  )
  const mediaJson = await mediaRes.json()
  if (!mediaRes.ok || mediaJson.error) throw new Error(`Meta media error: ${JSON.stringify(mediaJson)}`)

  const posts = await Promise.all(
    (mediaJson.data ?? []).map(async (post: { id: string; media_type: string; timestamp: string; caption?: string; like_count?: number; comments_count?: number }) => {
      const isVideo = post.media_type === 'VIDEO' || post.media_type === 'REELS'
      const isCarousel = post.media_type === 'CAROUSEL_ALBUM'
      // CAROUSEL_ALBUM requires carousel_album_ prefix on metric names
      const baseMetrics = isCarousel
        ? 'carousel_album_impressions,carousel_album_reach,carousel_album_saved'
        : 'reach,impressions,saved,shares'
      const videoMetrics = isVideo
        ? ',video_views,ig_reels_video_view_total_time,ig_reels_avg_watch_time'
        : ''

      try {
        const insightRes = await fetch(
          `https://graph.facebook.com/v25.0/${post.id}/insights?` +
          new URLSearchParams({
            metric: baseMetrics + videoMetrics,
            access_token: token,
          })
        )
        const insightJson = await insightRes.json()
        if (!insightRes.ok || insightJson.error) {
          throw new Error(insightJson.error?.message ?? `HTTP ${insightRes.status}`)
        }
        const metrics: Record<string, number> = {}
        for (const m of insightJson.data ?? []) {
          // Normalise carousel_album_ prefix so downstream keys are consistent
          const key = (m.name as string).replace('carousel_album_', '')
          metrics[key] = m.values?.[0]?.value ?? m.value ?? 0
        }

        const watchRatePct = isVideo && metrics.impressions
          ? ((metrics.video_views / metrics.impressions) * 100).toFixed(1)
          : null
        const avgWatchSec = metrics.ig_reels_avg_watch_time
          ? (metrics.ig_reels_avg_watch_time / 1000).toFixed(1)
          : null

        return {
          id: post.id,
          type: post.media_type,
          timestamp: post.timestamp,
          caption: post.caption?.slice(0, 100) ?? '',
          reach: metrics.reach ?? 0,
          impressions: metrics.impressions ?? 0,
          // likes/comments come from the media object — more reliable, no insights perm needed
          likes: post.like_count ?? 0,
          comments: post.comments_count ?? 0,
          shares: metrics.shares ?? 0,
          saved: metrics.saved ?? 0,
          videoViews: metrics.video_views ?? null,
          watchRatePct,
          avgWatchSec,
          totalWatchMs: metrics.ig_reels_video_view_total_time ?? null,
        }
      } catch (e) {
        return {
          id: post.id,
          type: post.media_type,
          timestamp: post.timestamp,
          caption: post.caption?.slice(0, 100) ?? '',
          error: true,
          errorDetail: String(e),
          likes: post.like_count ?? 0,
          comments: post.comments_count ?? 0,
          reach: 0, impressions: 0, shares: 0, saved: 0,
          videoViews: null, watchRatePct: null, avgWatchSec: null, totalWatchMs: null,
        }
      }
    })
  )

  return { posts }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const auth = req.headers.get('authorization')
  const keyOk = !!DASHBOARD_KEY && searchParams.get('key') === DASHBOARD_KEY
  const bearerOk = CRON_SECRET ? auth === `Bearer ${CRON_SECRET}` : false
  if (!keyOk && !bearerOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const week = weekStart()
  const db = supabase()
  const errors: string[] = []

  // GA4
  try {
    const data = await fetchGA4()
    await db.from('analytics_snapshots').upsert(
      { source: 'ga4', week_start: week, data },
      { onConflict: 'source,week_start' }
    )
  } catch (e) {
    errors.push(`GA4: ${e}`)
  }

  // Meta Ads
  try {
    const data = await fetchMetaAds()
    await db.from('analytics_snapshots').upsert(
      { source: 'meta_ads', week_start: week, data },
      { onConflict: 'source,week_start' }
    )
  } catch (e) {
    errors.push(`Meta Ads: ${e}`)
  }

  // Meta Organic
  try {
    const data = await fetchMetaOrganic()
    await db.from('analytics_snapshots').upsert(
      { source: 'meta_organic', week_start: week, data },
      { onConflict: 'source,week_start' }
    )
  } catch (e) {
    errors.push(`Meta Organic: ${e}`)
  }

  return NextResponse.json({ week, errors: errors.length ? errors : null })
}

// Allow Vercel cron (GET)
export async function GET(req: Request) {
  return POST(req)
}
