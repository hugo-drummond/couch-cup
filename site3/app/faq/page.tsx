'use client'

import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import PageLayout from '@/components/PageLayout'

const FAQS = [
  { q: 'How does the random draw work?', a: 'On the day signups close, we randomly select names from the waitlist to fill the bracket.' },
  { q: 'How do we prevent cheating?', a: 'Every match must be streamed live on YouTube and the stream link submitted in your match score form. No stream, no result, no advance. Streams save automatically so we can review any disputed result. Disconnect = lose, regardless of score.' },
  { q: "What if I don't get drawn?", a: "You go on the reserve list. If someone who got drawn drops out before their round 1 match, the next person on the list takes their spot. Reserve list members also get first crack at Season 2 signups." },
  { q: 'Do I need to be in South Africa?', a: 'Yes. Season 1 is SA only, 18 and over. Future seasons will open up to other countries.' },
  { q: "What if I don't have Discord?", a: "No problem — matches are coordinated via email by the Tournament Director, so you'll get everything you need in your inbox. We do encourage you to join our Discord though. It's where the community lives and every member helps it grow." },
  { q: 'How do I get paid if I win?', a: "By EFT to your South African bank account, paid the day after the final. We ask for your bank details only after you've won, never before. If anyone asks for banking info before the final, it's not us — block them." },
  { q: 'What happens if I disconnect mid-match?', a: "If you disconnect during a match, you lose. No replays, no restarts, no exceptions. Make sure your platform and internet are stable before you start." },
  { q: 'How do I stream my match?', a: "Create a YouTube account if you don't have one. Enable streaming in YouTube Studio, stream your match from kickoff to the final whistle, then paste your stream link into the score submission page." },
  { q: 'Can I enter more than once?', a: "No. One signup per person. We check for duplicate emails, mobile numbers, and gaming IDs. Duplicates are removed." },
]

function FAQList() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div>
      {FAQS.map((faq, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-start justify-between text-left"
            style={{ padding: '18px 0', gap: 16, color: 'var(--ink)' }}
          >
            <span style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.4 }}>{faq.q}</span>
            {open === i ? <Minus size={15} style={{ flexShrink: 0, marginTop: 3, color: 'var(--ink-light)' }} /> : <Plus size={15} style={{ flexShrink: 0, marginTop: 3, color: 'var(--ink-light)' }} />}
          </button>
          {open === i && (
            <div style={{ paddingBottom: 18 }}>
              <p style={{ fontSize: 15, color: 'var(--ink-mid)', lineHeight: 1.7 }}>{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function FAQPage() {
  return (
    <PageLayout eyebrow="Help" title="FAQs" lead="Everything you need to know about Couch Cup Season 1.">
      <FAQList />
    </PageLayout>
  )
}
