'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <>
      <header className="sticky top-0 z-50 transition-all duration-200"
        style={{ background: 'var(--bg)', borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent' }}>
        <div className="mx-auto max-w-[1280px] px-6 flex items-center justify-between" style={{ height: 120 }}>
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <Image src="/images/logo-cropped.png" alt="Couch Cup" width={211} height={148} className="object-contain h-[74px] w-auto translate-y-[10px]" />
          </Link>
          <nav className="flex items-center gap-6">
            <a href="https://discord.gg/Kz4qrFUgKJ" target="_blank" rel="noopener noreferrer"
              className="hidden md:block text-[14px] font-medium transition-colors"
              style={{ color: 'var(--ink-mid)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-mid)')}>
              Discord
            </a>
            <span className="hidden md:block w-px h-4" style={{ background: 'var(--border)' }} />
            <a href="/#signup"
              className="text-[14px] font-semibold px-5 py-2.5 rounded-lg transition-all"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dark)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
              Sign up
            </a>
            <button onClick={() => setOpen(o => !o)} className="w-9 h-9 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--ink)' }}>
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </nav>
        </div>
      </header>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed top-[72px] right-4 z-50 rounded-xl shadow-2xl overflow-hidden w-56"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {[['About', '/about'], ['How it works', '/how-it-works'], ['Blogs', '/blog'], ['Tournament', '/tournament'], ['FAQs', '/#faq'], ['Discord', 'https://discord.gg/Kz4qrFUgKJ']].map(([label, href]) => (
              <a key={label} href={href} onClick={() => setOpen(false)}
                className="block px-5 py-3.5 text-[14px] font-medium transition-colors"
                style={{ color: 'var(--ink)', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {label}
              </a>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Footer() {
  return (
    <footer style={{ background: 'var(--surface)' }} className="py-16">
      <div className="mx-auto max-w-[1280px] px-6">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48 }}>
          <div>
            <Image src="/images/logo-transparent.png" alt="Couch Cup" width={105} height={72} className="object-contain object-left mb-5" />
            <p style={{ fontSize: 14, color: 'rgba(240,244,248,0.7)', lineHeight: 1.65 }}>South Africa's casual gaming league.</p>
            <p style={{ fontSize: 13, color: 'rgba(240,244,248,0.4)', marginTop: 8 }}>Operated by Drummond Holdings (Pty) Ltd</p>
          </div>
          {[
            { head: 'Socials', links: [['Instagram', 'https://instagram.com/couchcup'], ['TikTok', 'https://tiktok.com/@couchcup'], ['YouTube', 'https://youtube.com/@couchcup'], ['Discord', 'https://discord.gg/Kz4qrFUgKJ']] },
            { head: 'Legal', links: [['Terms', '/terms'], ['Privacy', '/privacy'], ['Providers', '/providers'], ['PAIA', '/paia'], ['Rules', '/rules']] },
            { head: 'Contact', links: [['hello@couchcup.co.za', 'mailto:hello@couchcup.co.za']] },
          ].map(col => (
            <div key={col.head}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(240,244,248,0.4)', marginBottom: 16 }}>{col.head}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(([label, href]) => (
                  <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined}
                    style={{ fontSize: 14, color: 'rgba(240,244,248,0.7)', textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,0.7)')}>
                    {label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(244,237,226,0.1)' }}>
          <p style={{ fontSize: 13, color: 'rgba(244,237,226,0.35)' }}>© 2026 Drummond Holdings (Pty) Ltd. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

interface Props {
  eyebrow: string
  title: string
  lead: string
  children: React.ReactNode
}

export default function PageLayout({ eyebrow, title, lead, children }: Props) {
  return (
    <>
      <Navbar />
      <main style={{ minHeight: '70vh' }}>
        <div className="mx-auto max-w-[760px] px-6 py-20">
          <p className="font-semibold uppercase tracking-[0.12em] mb-5" style={{ fontSize: 12, color: 'var(--ink-light)' }}>
            {eyebrow}
          </p>
          <h1 className="font-display" style={{ fontSize: 'clamp(40px, 6vw, 64px)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.05, marginBottom: 28 }}>
            {title}
          </h1>
          <p style={{ fontSize: 20, color: 'var(--ink-mid)', lineHeight: 1.65, marginBottom: 64 }}>
            {lead}
          </p>
          <div className="content-body">
            {children}
          </div>
        </div>
      </main>
      <Footer />

      <style>{`
        .content-body h2 {
          font-family: var(--font-fraunces), Georgia, serif;
          font-size: 28px;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: -0.02em;
          margin: 56px 0 16px;
        }
        .content-body h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--ink);
          margin: 32px 0 10px;
        }
        .content-body p {
          font-size: 17px;
          color: var(--ink-mid);
          line-height: 1.75;
          margin-bottom: 16px;
        }
        .content-body ul {
          margin: 12px 0 20px 0;
          padding-left: 0;
          list-style: none;
        }
        .content-body li {
          font-size: 16px;
          color: var(--ink-mid);
          line-height: 1.7;
          margin-bottom: 8px;
          padding-left: 20px;
          position: relative;
        }
        .content-body li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 10px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
        }
        .content-body .def-row {
          display: flex;
          gap: 32px;
          padding: 12px 0;
          border-bottom: 1px solid var(--border);
          font-size: 15px;
        }
        .content-body .def-label {
          color: var(--ink-light);
          width: 180px;
          flex-shrink: 0;
        }
        .content-body .def-value {
          color: var(--ink);
          font-weight: 500;
        }
        .content-body .notice {
          background: var(--cream);
          border-left: 3px solid var(--accent);
          padding: 14px 18px;
          border-radius: 0 8px 8px 0;
          margin: 20px 0;
        }
        .content-body .notice p {
          font-size: 14px;
          margin: 0;
        }
        .def-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 32px;
        }
      `}</style>
    </>
  )
}
