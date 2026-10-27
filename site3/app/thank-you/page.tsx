import PageLayout from '@/components/PageLayout'

export const metadata = { title: "You're registered — Couch Cup" }

export default function ThankYouPage() {
  return (
    <PageLayout eyebrow="You're in" title="You're registered for Season 2." lead="We've added you to Season 2 (Fortnite Duos, Friday 28 August). A confirmation email should land in your inbox shortly.">
      <div className="content-body">
        <h2>What happens next</h2>
        <ul>
          {['Signups close when the tournament fills.',
            'On draw day we randomly draw names from the waitlist into the bracket.',
            "If your name gets drawn, you'll get an email with your bracket position and your round 1 opponent.",
            'The final is streamed live.',
            'The winner gets paid the cash prize by EFT after the final.'
          ].map(item => <li key={item}>{item}</li>)}
        </ul>
        <h2>Join the Discord</h2>
        <p>Most players coordinate matches in our Discord server. It's where the highlights get posted, the bracket updates happen, and where you'll see tournament announcements first.</p>
        <a href="https://discord.gg/Kz4qrFUgKJ" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#5865F2', color: '#fff', padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', marginTop: 8 }}>
          Join the Discord →
        </a>
        <h2>Follow along</h2>
        <p>If you'd rather watch than play, follow us.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          {[['Instagram', 'https://instagram.com/couchcup'], ['TikTok', 'https://tiktok.com/@couchcup'], ['YouTube', 'https://www.youtube.com/@couchcupp']].map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              style={{ border: '1px solid var(--border)', color: 'var(--ink)', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </PageLayout>
  )
}
