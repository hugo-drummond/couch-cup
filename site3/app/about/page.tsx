import PageLayout from '@/components/PageLayout'

export const metadata = { title: 'What is Couch Cup — Couch Cup' }

export default function AboutPage() {
  return (
    <PageLayout eyebrow="About" title="What is Couch Cup" lead="Couch Cup is South Africa's casual gaming league.">
      <div className="content-body">
        <p>Couch Cup is gaming competitions for everyone. For too long, only the top 1% have been able to enjoy gaming competitions. Couch Cup is for the other 99% of players—the casual players. There's no qualification process, no hard grind to make the tournaments. You see what tournaments we're hosting, sign up, and hope your name gets pulled from the random waitlist. If your name comes out, you're in the bracket. If not, you're on the reserve list.</p>
        <p>The winner gets a R500 cash prize. Sign up on our homepage for tournament updates.</p>

        <h2>Who runs Couch Cup</h2>
        <p>Couch Cup is operated by Drummond Holdings (Pty) Ltd, a South African private company.</p>
        <p>Got a question, a complaint, or want to sponsor a season? Email us: <a href="mailto:hello@couchcup.co.za">hello@couchcup.co.za</a></p>

        <h2>How a tournament works</h2>
        <p><strong>Sign up.</strong> When a tournament opens, head to the homepage and add your name to the waitlist. Entry is free. You'll need a gaming account on the relevant platform and a YouTube account for streaming.</p>
        <p><strong>The draw.</strong> Once signups close, we randomly select players from the waitlist to fill the bracket. If you don't get drawn, you go on the reserve list — if someone drops out before their round 1 match, you take their spot.</p>
        <p><strong>Accept your spot.</strong> If you're drawn, you get an email. You have 24 hours to accept. Miss the window and your spot goes to the next person on the reserve list.</p>
        <p><strong>Schedule your match.</strong> After accepting, you get a link to submit your availability. You and your opponent each pick your available times and the system automatically schedules the match at the earliest slot that works for both of you.</p>
        <p><strong>Play and stream.</strong> Every match must be streamed live on YouTube — this is mandatory. The stream is how we verify results and settle any disputes. Start streaming before kickoff and keep going until the final whistle.</p>
        <p><strong>Submit your score.</strong> Once the match ends you have 4 hours to submit the result using the link emailed to you. Include your YouTube stream link. If both players submit the same score the winner advances automatically. If scores conflict, the Tournament Director reviews the streams.</p>
        <p><strong>Advance.</strong> Win and you move to the next round. Lose and you're out. The last player standing wins R500.</p>
      </div>
    </PageLayout>
  )
}
