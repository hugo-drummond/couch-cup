import { sql } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import PostBody from '@/app/blog/PostBody'
import type { PostBodyData } from '@/app/blog/PostBody'

const BASE_URL = 'https://couchcup.co.za'

interface BlogPost {
  id: string
  slug: string
  title: string
  category: string
  game: string
  meta_description: string
  published_at: string
  body: PostBodyData
}

interface RelatedPost {
  slug: string
  title: string
  category: string
  game: string
  published_at: string
}

/* ── Metadata ── */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  let post: BlogPost | null = null
  try {
    const rows = await sql<BlogPost>(
      `SELECT title, slug, meta_description, published_at, body
       FROM blog_posts
       WHERE slug = $1 AND status = 'published'
       LIMIT 1`,
      [slug]
    )
    if (rows[0]) {
      post = {
        ...rows[0],
        body: typeof rows[0].body === 'string' ? JSON.parse(rows[0].body) : (rows[0].body ?? {}),
      }
    }
  } catch {
    // pass
  }

  if (!post) {
    return { title: 'Post not found — Couch Cup' }
  }

  const body = post.body as PostBodyData
  const description = post.meta_description || body?.key_takeaway?.slice(0, 155) || ''
  const url = `${BASE_URL}/blog/${post.slug}`

  return {
    title: `${post.title} — Couch Cup`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      url,
      siteName: 'Couch Cup',
      publishedTime: post.published_at,
    },
  }
}

/* ── Helpers ── */
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  })
}

/* ── Page ── */
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let post: BlogPost | null = null
  let related: RelatedPost[] = []

  try {
    const rows = await sql<BlogPost>(
      `SELECT id, slug, title, category, game, meta_description, published_at, body
       FROM blog_posts
       WHERE slug = $1 AND status = 'published'
       LIMIT 1`,
      [slug]
    )
    if (rows[0]) {
      post = {
        ...rows[0],
        body: typeof rows[0].body === 'string' ? JSON.parse(rows[0].body) : (rows[0].body ?? {}),
      }
    }
  } catch {
    // pass
  }

  if (!post) notFound()

  try {
    const rows = await sql<RelatedPost>(
      `SELECT slug, title, category, game, published_at
       FROM blog_posts
       WHERE status = 'published' AND slug != $1
       ORDER BY published_at DESC
       LIMIT 3`,
      [slug]
    )
    related = rows
  } catch {
    // pass
  }

  const body = post.body as PostBodyData

  /* JSON-LD */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta_description || body?.key_takeaway || '',
    datePublished: post.published_at,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/blog/${post.slug}` },
    author: { '@type': 'Organization', name: 'Couch Cup' },
    publisher: {
      '@type': 'Organization',
      name: 'Couch Cup',
      url: BASE_URL,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <BlogNav />

      <main style={{ minHeight: '80vh' }}>
        <article style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px 80px' }}>

          {/* Eyebrow */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {post.category && (
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.12em', color: 'var(--ink-light)',
              }}>
                {post.category}
              </span>
            )}
            {post.category && post.game && (
              <span style={{ color: 'var(--border)', fontSize: 11 }}>·</span>
            )}
            {post.game && (
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.12em', color: 'var(--accent)',
              }}>
                {post.game.replace(/-/g, ' ')}
              </span>
            )}
          </div>

          {/* H1 */}
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(32px, 6vw, 54px)',
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              marginBottom: 20,
            }}
          >
            {body?.header || post.title}
          </h1>

          {/* Date */}
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 36 }}>
            {formatDate(post.published_at)}
          </p>

          {/* Image placeholder — uncomment and swap src when images are added */}
          {/* <div style={{ marginBottom: 40, borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: 'var(--surface)' }} /> */}

          <PostBody body={body} title={post.title} />

          {/* Divider */}
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: 48 }} />

          {/* More posts */}
          {related.length > 0 && (
            <section>
              <p style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.14em', color: 'var(--ink-light)', marginBottom: 24,
              }}>
                More posts
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {related.map(rel => (
                  <Link key={rel.slug} href={`/blog/${rel.slug}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 16,
                      padding: '14px 18px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      transition: 'border-color 0.15s',
                    }}>
                      <div>
                        {rel.game && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.1em', color: 'var(--accent)', display: 'block', marginBottom: 4,
                          }}>
                            {rel.game.replace(/-/g, ' ')}
                          </span>
                        )}
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
                          {rel.title}
                        </span>
                      </div>
                      <span style={{ fontSize: 18, color: 'var(--ink-light)', flexShrink: 0 }}>→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

        </article>
      </main>

      <BlogFooter />
    </>
  )
}

/* ── Shared nav/footer (server-renderable) ── */
function BlogNav() {
  return (
    <header style={{
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div className="mx-auto max-w-[1280px] px-6 flex items-center justify-between" style={{ height: 72 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <Image src="/images/logo-transparent.png" alt="Couch Cup" width={52} height={52} className="object-contain" />
        </a>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="/blog" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-mid)', textDecoration: 'none' }}>
            ← Blog
          </a>
          <a href="/#signup"
            style={{
              fontSize: 14, fontWeight: 700, padding: '8px 20px', borderRadius: 8,
              background: 'var(--accent)', color: '#fff', textDecoration: 'none',
            }}>
            Sign up
          </a>
        </nav>
      </div>
    </header>
  )
}

function BlogFooter() {
  return (
    <footer style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '48px 0' }}>
      <div className="mx-auto max-w-[1280px] px-6">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <a href="/blog" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 600, color: 'var(--ink-mid)' }}>← All posts</a>
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
