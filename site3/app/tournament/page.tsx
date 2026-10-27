import PageLayout from '@/components/PageLayout'
import TournamentBracket from '@/components/TournamentBracket'

export const metadata = { title: 'Tournament Details — Couch Cup' }

export default function TournamentPage() {
  return (
    <PageLayout eyebrow="Season 1" title="Couch Cup Season 1" lead="Everything you need to know about the current season.">
      {/* Break out of the 760px article column so the full tree fits */}
      <div style={{ position: 'relative', left: '50%', transform: 'translateX(-50%)', width: 'min(1232px, calc(100vw - 48px))' }}>
        <TournamentBracket />
      </div>
      <div className="content-body" style={{ marginTop: 40 }}>
        <h2>Details</h2>
        {[['Platform', 'Your platform'], ['Format', 'Single elimination'],
          ['Match length', '6 minute halves'], ['Prize', 'R500 to the winner'], ['Entry', 'Free']
        ].map(([l, v]) => (
          <div key={l} className="def-row"><span className="def-label">{l}</span><span className="def-value">{v}</span></div>
        ))}

        <h2>Timeline</h2>
        {[['Signups open', 'Monday 19 May 2026'], ['Signups close', 'Sunday 15 June 2026'],
          ['Bracket draw', 'Monday 15 June 2026'], ['Round 1', 'Thursday 19 June – Saturday 21 June'],
          ['Round 2', 'Monday 23 June – Tuesday 24 June'], ['Quarter-finals', 'Thursday 26 June – Friday 27 June'],
          ['Semi-finals', 'Monday 29 June – Tuesday 30 June'], ['Final (live streamed)', 'Friday 3 July 2026 at 19:00 SAST'],
          ['Winner paid', 'Monday 6 July 2026']
        ].map(([l, v]) => (
          <div key={l} className="def-row"><span className="def-label">{l}</span><span className="def-value">{v}</span></div>
        ))}

        <h2>Eligibility</h2>
        <p>To enter you must be:</p>
        <ul>
          {['18 years or older', 'A resident of South Africa', 'Able to play on your platform with a copy of the tournament game',
            'Able to stream every match live on Twitch or YouTube from your platform', 'Able to record a screenshot of your match score'
          ].map(item => <li key={item}>{item}</li>)}
        </ul>
        <p>You can enter once per tournament. Multiple entries with the same identity are removed.</p>
      </div>
    </PageLayout>
  )
}
