import React from 'react'

/* ── Types ── */
export interface ProseSection {
  type: 'prose'
  heading?: string
  markdown: string
}
export interface RankedListSection {
  type: 'ranked_list'
  heading: string
  items: string[]
}
export interface ThresholdTableSection {
  type: 'threshold_table'
  heading: string
  rows: { label: string; value: string; note?: string }[]
}
export type Section = ProseSection | RankedListSection | ThresholdTableSection

export interface PostBodyData {
  header?: string
  key_takeaway?: string
  sections?: Section[]
  video_url?: string
  video_title?: string
  cta?: string
}

/* ── Helpers ── */
function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match ? `https://www.youtube.com/embed/${match[1]}` : null
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--ink)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

function renderParagraphs(markdown: string) {
  return markdown.split(/\n+/).filter(Boolean).map((para, i) => (
    <p key={i} style={{ fontSize: 17, color: 'var(--ink-mid)', lineHeight: 1.8, marginBottom: 16 }}>
      {renderInline(para)}
    </p>
  ))
}

/* ── Section renderers ── */
function ProseBlock({ section }: { section: ProseSection }) {
  return (
    <div style={{ marginBottom: 40 }}>
      {section.heading && (
        <h2 className="font-display" style={{
          fontSize: 'clamp(22px, 3vw, 28px)',
          fontWeight: 700,
          color: 'var(--ink)',
          letterSpacing: '-0.02em',
          marginBottom: 20,
          marginTop: 0,
        }}>
          {section.heading}
        </h2>
      )}
      {renderParagraphs(section.markdown)}
    </div>
  )
}

function RankedListBlock({ section }: { section: RankedListSection }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 className="font-display" style={{
        fontSize: 'clamp(22px, 3vw, 28px)',
        fontWeight: 700,
        color: 'var(--ink)',
        letterSpacing: '-0.02em',
        marginBottom: 20,
        marginTop: 0,
      }}>
        {section.heading}
      </h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {section.items.map((item, i) => (
          <li key={i} style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
            padding: '14px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}>
            <span style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--accent)',
              minWidth: 28,
              lineHeight: 1.4,
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 15, color: 'var(--ink-mid)', lineHeight: 1.7 }}>
              {renderInline(item)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ThresholdTableBlock({ section }: { section: ThresholdTableSection }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 className="font-display" style={{
        fontSize: 'clamp(22px, 3vw, 28px)',
        fontWeight: 700,
        color: 'var(--ink)',
        letterSpacing: '-0.02em',
        marginBottom: 20,
        marginTop: 0,
      }}>
        {section.heading}
      </h2>
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {section.rows.map((row, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 1fr',
            gap: 16,
            padding: '14px 20px',
            borderBottom: i < section.rows.length - 1 ? '1px solid var(--border)' : 'none',
            background: i % 2 === 0 ? 'var(--surface)' : 'transparent',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              {row.label}
            </span>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--accent)',
              fontFamily: 'var(--font-fraunces), Georgia, serif',
            }}>
              {row.value}
            </span>
            {row.note && (
              <span style={{ fontSize: 13, color: 'var(--ink-light)', lineHeight: 1.5 }}>
                {row.note}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function renderSection(section: Section, i: number) {
  switch (section.type) {
    case 'prose':            return <ProseBlock key={i} section={section} />
    case 'ranked_list':      return <RankedListBlock key={i} section={section} />
    case 'threshold_table':  return <ThresholdTableBlock key={i} section={section} />
    default:                 return null
  }
}

/* ── Main shared component ── */
export default function PostBody({
  body,
  title,
}: {
  body: PostBodyData
  title: string
}) {
  const embedUrl = body.video_url ? youtubeEmbedUrl(body.video_url) : null

  return (
    <>
      {/* Key takeaway callout */}
      {body.key_takeaway && (
        <blockquote style={{
          margin: '0 0 44px',
          padding: '22px 24px',
          background: '#0D1E38',
          borderLeft: '3px solid var(--accent)',
          borderRadius: '0 12px 12px 0',
        }}>
          <p style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 'clamp(17px, 2.5vw, 20px)',
            fontWeight: 600,
            color: 'var(--ink)',
            lineHeight: 1.65,
            margin: 0,
          }}>
            {body.key_takeaway}
          </p>
          <span style={{
            display: 'block',
            marginTop: 12,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--accent)',
          }}>
            Key Takeaway
          </span>
        </blockquote>
      )}

      {/* Sections */}
      {body.sections?.map((section, i) => renderSection(section, i))}

      {/* YouTube embed */}
      {embedUrl && (
        <div style={{ marginBottom: 44 }}>
          <div style={{
            position: 'relative',
            paddingBottom: '56.25%',
            height: 0,
            overflow: 'hidden',
            borderRadius: 12,
            background: 'var(--surface)',
          }}>
            <iframe
              src={embedUrl}
              title={body.video_title || title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                position: 'absolute',
                top: 0, left: 0,
                width: '100%', height: '100%',
                border: 'none',
                borderRadius: 12,
              }}
            />
          </div>
          {body.video_title && (
            <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 10, textAlign: 'center', fontStyle: 'italic' }}>
              {body.video_title}
            </p>
          )}
        </div>
      )}

      {/* CTA */}
      {body.cta && (
        <div style={{
          margin: '0 0 56px',
          padding: '28px 28px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
        }}>
          <p style={{ fontSize: 16, color: 'var(--ink-mid)', lineHeight: 1.7, marginBottom: 20, marginTop: 0 }}>
            {body.cta}
          </p>
          <a href="/#signup"
            style={{
              display: 'inline-block',
              fontSize: 14,
              fontWeight: 700,
              padding: '12px 28px',
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            Sign up for Couch Cup — it&apos;s free →
          </a>
        </div>
      )}
    </>
  )
}
