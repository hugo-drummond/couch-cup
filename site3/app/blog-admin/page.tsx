import { sql } from '@/lib/supabase'
import PostBody from '@/app/blog/PostBody'
import type { PostBodyData } from '@/app/blog/PostBody'
import { approvePost, rejectPost } from './actions'

const DASHBOARD_KEY = process.env.DASHBOARD_KEY

interface DraftPost {
  id: string
  slug: string
  title: string
  category: string | null
  game: string | null
  meta_description: string | null
  reading_grade: number | null
  sources: string[] | null
  created_at: string
  body: PostBodyData
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
  })
}

export default async function BlogAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const params = await searchParams
  const key = params.key

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

  let drafts: DraftPost[] = []
  try {
    const rows = await sql<DraftPost>(
      `SELECT id, slug, title, category, game, meta_description, reading_grade, sources, created_at, body
       FROM blog_posts
       WHERE status = 'draft'
       ORDER BY created_at DESC`
    )
    drafts = rows.map(r => ({
      ...r,
      body: typeof r.body === 'string' ? JSON.parse(r.body) : (r.body ?? {}),
    }))
  } catch {
    // pass
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#E8EDF4' }}>

      {/* Header */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#0A1628',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '0 24px',
      }}>
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: '#DC1430',
            }}>
              Blog Admin
            </span>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 14 }}>·</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              {drafts.length} draft{drafts.length !== 1 ? 's' : ''} pending
            </span>
          </div>
          <a href="/blog" style={{
            fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.4)',
            textDecoration: 'none',
          }}>
            ← Blog
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>

        {drafts.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '80px 0',
          }}>
            <span style={{ fontSize: 32 }}>✓</span>
            <p style={{
              fontSize: 16, fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              textAlign: 'center', margin: 0,
            }}>
              No drafts to review
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 60 }}>
            {drafts.map((draft) => (
              <article key={draft.id} style={{
                background: '#0F1E33',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                overflow: 'hidden',
              }}>

                {/* Draft header */}
                <div style={{
                  padding: '24px 28px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ flex: '1 1 400px' }}>
                    {/* Eyebrow */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      {draft.category && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)',
                          background: 'rgba(255,255,255,0.06)',
                          padding: '3px 8px', borderRadius: 4,
                        }}>
                          {draft.category}
                        </span>
                      )}
                      {draft.game && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.12em', color: '#DC1430',
                          background: 'rgba(220,20,48,0.12)',
                          padding: '3px 8px', borderRadius: 4,
                        }}>
                          {draft.game.replace(/-/g, ' ')}
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: '#f5a623',
                        background: 'rgba(245,166,35,0.12)',
                        padding: '3px 8px', borderRadius: 4,
                      }}>
                        Draft
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="font-display" style={{
                      fontSize: 'clamp(20px, 3vw, 26px)',
                      fontWeight: 700,
                      color: '#E8EDF4',
                      letterSpacing: '-0.02em',
                      margin: '0 0 8px',
                      lineHeight: 1.2,
                    }}>
                      {draft.title}
                    </h2>

                    {/* Slug */}
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '0 0 4px', fontFamily: 'monospace' }}>
                      /blog/{draft.slug}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'flex-start' }}>
                    <form action={approvePost.bind(null, draft.id, key)}>
                      <button type="submit" style={{
                        fontSize: 13, fontWeight: 700,
                        padding: '10px 20px',
                        borderRadius: 8,
                        background: '#DC1430',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        letterSpacing: '0.01em',
                      }}>
                        Approve →
                      </button>
                    </form>
                    <form action={rejectPost.bind(null, draft.id, key)}>
                      <button type="submit" style={{
                        fontSize: 13, fontWeight: 600,
                        padding: '10px 20px',
                        borderRadius: 8,
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.45)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        cursor: 'pointer',
                      }}>
                        Reject
                      </button>
                    </form>
                  </div>
                </div>

                {/* Meta strip */}
                <div style={{
                  padding: '14px 28px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 24,
                  background: 'rgba(0,0,0,0.15)',
                }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', margin: '0 0 3px' }}>
                      Created
                    </p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                      {formatDate(draft.created_at)}
                    </p>
                  </div>
                  {draft.reading_grade != null && (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', margin: '0 0 3px' }}>
                        Reading Grade
                      </p>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                        {draft.reading_grade}
                      </p>
                    </div>
                  )}
                  {draft.meta_description && (
                    <div style={{ flex: '1 1 300px' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', margin: '0 0 3px' }}>
                        Meta description
                      </p>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
                        {draft.meta_description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Sources */}
                {draft.sources && draft.sources.length > 0 && (
                  <div style={{
                    padding: '14px 28px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(0,0,0,0.1)',
                  }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', margin: '0 0 8px' }}>
                      Sources ({draft.sources.length})
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {draft.sources.map((src, i) => (
                        <li key={i}>
                          <a
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 12, color: '#6B9FD4',
                              textDecoration: 'none',
                              fontFamily: 'monospace',
                              wordBreak: 'break-all',
                            }}
                          >
                            {src}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Full rendered body preview */}
                <div style={{
                  padding: '32px 28px 8px',
                  /* override CSS vars to match blog detail page dark theme */
                  ['--ink' as string]: '#E8EDF4',
                  ['--ink-mid' as string]: '#B0BCCC',
                  ['--ink-light' as string]: '#6B7A8D',
                  ['--accent' as string]: '#DC1430',
                  ['--surface' as string]: 'rgba(255,255,255,0.04)',
                  ['--border' as string]: 'rgba(255,255,255,0.08)',
                  ['--bg' as string]: '#0A1628',
                }}>
                  <p style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.12em', color: 'rgba(255,255,255,0.25)',
                    marginBottom: 24, marginTop: 0,
                  }}>
                    Preview
                  </p>
                  <PostBody body={draft.body} title={draft.title} />
                </div>

              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
