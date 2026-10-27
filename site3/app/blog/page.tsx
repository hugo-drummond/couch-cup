import { sql } from '@/lib/supabase'
import Link from 'next/link'
import { Metadata } from 'next'
import BlogNav from '@/components/BlogNav'

export const metadata: Metadata = {
  title: 'Blog — Couch Cup',
  description: 'Tactics, tips and tournament intel for casual competitive gaming.',
}

interface BlogPost {
  id: string
  slug: string
  title: string
  category: string
  game: string
  meta_description: string
  published_at: string
  body: {
    key_takeaway?: string
    [key: string]: unknown
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  })
}

function Tag({ children, accent }: { children: string; accent?: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      padding: '3px 8px',
      borderRadius: 4,
      background: accent ? 'rgba(220,20,48,0.15)' : 'rgba(30,48,80,0.8)',
      color: accent ? 'var(--accent)' : 'var(--ink-light)',
      border: accent ? '1px solid rgba(220,20,48,0.3)' : '1px solid var(--border)',
    }}>
      {children}
    </span>
  )
}

function EmptyState() {
  return (
    <div style={{
      gridColumn: '1 / -1',
      textAlign: 'center',
      padding: '80px 24px',
      color: 'var(--ink-light)',
    }}>
      <p style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>
        No posts yet
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.65 }}>
        Tactics, tips and tournament intel coming soon.
      </p>
    </div>
  )
}

function BlogCard({ post }: { post: BlogPost }) {
  const snippet = post.body?.key_takeaway
    ? post.body.key_takeaway.slice(0, 120) + (post.body.key_takeaway.length > 120 ? '…' : '')
    : post.meta_description?.slice(0, 120)

  return (
    <Link href={`/blog/${post.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <article
        className="blog-card"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          overflow: 'hidden',
          cursor: 'pointer',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Image placeholder slot — swap in real image when available */}
        {/* <div style={{ height: 200, background: 'var(--cream)' }} /> */}

        <div style={{ padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          {/* Tags */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {post.category && <Tag>{post.category}</Tag>}
            {post.game && <Tag accent>{post.game.replace(/-/g, ' ')}</Tag>}
          </div>

          {/* Title */}
          <h2 style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 'clamp(18px, 2.5vw, 22px)',
            fontWeight: 700,
            color: 'var(--ink)',
            lineHeight: 1.25,
            letterSpacing: '-0.02em',
            margin: 0,
          }}>
            {post.title}
          </h2>

          {/* Key takeaway snippet */}
          {snippet && (
            <p style={{
              fontSize: 14,
              color: 'var(--ink-mid)',
              lineHeight: 1.65,
              margin: 0,
              flex: 1,
            }}>
              {snippet}
            </p>
          )}

          {/* Date */}
          <p style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--ink-light)',
            margin: 0,
          }}>
            {formatDate(post.published_at)}
          </p>
        </div>
      </article>
    </Link>
  )
}

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; game?: string }>
}) {
  const params = await searchParams
  const { category, game } = params

  let posts: BlogPost[] = []
  try {
    let query = `
      SELECT id, slug, title, category, game, meta_description, published_at,
             body->>'key_takeaway' as key_takeaway_text,
             body
      FROM blog_posts
      WHERE status = 'published'
    `
    const args: (string | null)[] = []

    if (category) {
      args.push(category)
      query += ` AND category = $${args.length}`
    }
    if (game) {
      args.push(game)
      query += ` AND game = $${args.length}`
    }

    query += ` ORDER BY published_at DESC`

    const rows = await sql<{
      id: string
      slug: string
      title: string
      category: string
      game: string
      meta_description: string
      published_at: string
      body: BlogPost['body']
    }>(query, args)

    posts = rows.map(r => ({
      ...r,
      body: typeof r.body === 'string' ? JSON.parse(r.body) : (r.body ?? {}),
    }))
  } catch {
    // table may not exist yet; render empty state
  }

  // Collect distinct filter options from all published posts for the filter UI
  let allCategories: string[] = []
  let allGames: string[] = []
  try {
    const cats = await sql<{ category: string }>(
      `SELECT DISTINCT category FROM blog_posts WHERE status = 'published' AND category IS NOT NULL ORDER BY category`
    )
    const games = await sql<{ game: string }>(
      `SELECT DISTINCT game FROM blog_posts WHERE status = 'published' AND game IS NOT NULL ORDER BY game`
    )
    allCategories = cats.map(r => r.category)
    allGames = games.map(r => r.game)
  } catch {
    // silently skip if table missing
  }

  const buildFilterUrl = (key: string, val: string | undefined) => {
    const p = new URLSearchParams()
    if (key !== 'category' && category) p.set('category', category)
    if (key !== 'game' && game) p.set('game', game)
    if (val) p.set(key, val)
    const qs = p.toString()
    return `/blog${qs ? '?' + qs : ''}`
  }

  return (
    <>
      {/* Reuse Navbar/Footer pattern from existing pages — inline since blog is a server component */}
      <BlogNav />

      <main style={{ minHeight: '80vh' }}>
        <div className="mx-auto max-w-[1280px] px-6 py-16">

          {/* Header */}
          <div style={{ marginBottom: 48 }}>
            <p style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.14em', color: 'var(--ink-light)', marginBottom: 12,
            }}>
              Couch Cup
            </p>
            <h1
              className="font-display"
              style={{
                fontSize: 'clamp(40px, 6vw, 64px)',
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '-0.025em',
                lineHeight: 1.05,
                marginBottom: 16,
              }}
            >
              Blog
            </h1>
            <p style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.65, maxWidth: 540 }}>
              Tactics, tips and tournament intel for casual competitive gaming.
            </p>
          </div>

          {/* Filter bar */}
          {(allCategories.length > 0 || allGames.length > 0) && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 40,
              paddingBottom: 28,
              borderBottom: '1px solid var(--border)',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-light)', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Filter:
              </span>

              <a href="/blog"
                style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                  background: !category && !game ? 'var(--accent)' : 'var(--surface)',
                  color: !category && !game ? '#fff' : 'var(--ink-mid)',
                  border: '1px solid var(--border)',
                  textDecoration: 'none',
                }}>
                All
              </a>

              {allCategories.map(cat => (
                <a key={cat} href={buildFilterUrl('category', cat === category ? undefined : cat)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                    background: category === cat ? 'var(--accent)' : 'var(--surface)',
                    color: category === cat ? '#fff' : 'var(--ink-mid)',
                    border: '1px solid var(--border)',
                    textDecoration: 'none',
                    textTransform: 'capitalize',
                  }}>
                  {cat}
                </a>
              ))}

              {allCategories.length > 0 && allGames.length > 0 && (
                <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
              )}

              {allGames.map(g => (
                <a key={g} href={buildFilterUrl('game', g === game ? undefined : g)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                    background: game === g ? 'rgba(220,20,48,0.2)' : 'var(--surface)',
                    color: game === g ? 'var(--accent)' : 'var(--ink-mid)',
                    border: game === g ? '1px solid rgba(220,20,48,0.4)' : '1px solid var(--border)',
                    textDecoration: 'none',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                  {g.replace(/-/g, ' ')}
                </a>
              ))}
            </div>
          )}

          {/* Post grid */}
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 20 }}
          >
            {posts.length === 0 ? <EmptyState /> : posts.map(post => (
              <BlogCard key={post.id} post={post} />
            ))}
          </div>

        </div>
      </main>

      <BlogFooter />
    </>
  )
}

/* ── Footer ── */
function BlogFooter() {
  return (
    <footer style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '48px 0' }}>
      <div className="mx-auto max-w-[1280px] px-6">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 600, color: 'var(--ink-mid)' }}>← Couch Cup</a>
          <a href="/#signup"
            style={{
              fontSize: 14, fontWeight: 700, padding: '10px 24px', borderRadius: 8,
              background: 'var(--accent)', color: '#fff', textDecoration: 'none',
            }}>
            Sign up for free →
          </a>
        </div>
        <p style={{ marginTop: 32, fontSize: 13, color: 'var(--ink-light)' }}>
          © 2026 Drummond Holdings (Pty) Ltd. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
