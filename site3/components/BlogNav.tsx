'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

/* Full site burger nav for the blog (server pages render this client component). */
export default function BlogNav() {
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
