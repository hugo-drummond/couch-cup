import { MetadataRoute } from 'next'
import { sql } from '@/lib/supabase'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://couchcup.co.za'

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/how-it-works`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/tournament`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/rules`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/paia`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ]

  let blogRoutes: MetadataRoute.Sitemap = []
  try {
    const posts = await sql<{ slug: string; published_at: string }>(
      `SELECT slug, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC`
    )
    blogRoutes = posts.map(p => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.published_at),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))
  } catch {
    // blog_posts table may not exist yet
  }

  return [...staticRoutes, ...blogRoutes]
}
