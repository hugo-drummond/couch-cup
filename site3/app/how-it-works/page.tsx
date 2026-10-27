import PageLayout from '@/components/PageLayout'

export const metadata = { title: 'How it works — Couch Cup' }

export default function HowItWorksPage() {
  return (
    <PageLayout eyebrow="Format" title="How it works"
      lead="Couch Cup runs as a single-elimination bracket. You sign up on the waitlist. We draw names at random. Drawn players compete across set rounds. Last one standing wins the prize.">
      <div className="content-body">
        <h2>The signup</h2>
        <p>Fill in the form on the home page. We ask for your name, email, mobile number, date of birth, and gaming ID. Plus the legal acknowledgements required under POPIA and the CPA.</p>
        <p>No fee, no qualification, no skill check. Signups close on the date listed on the tournament page.</p>
        <h2>The random draw</h2>
        <p>On draw day we randomly select names from the waitlist to fill the bracket. If your name gets drawn, you get an email with your bracket position and your round 1 opponent. If your name doesn't get drawn, you go on the reserve list. If someone drops out before their match, the next person on the list slots in.</p>
        <h2>Accepting your spot</h2>
        <p>You have 24 hours to accept via the link in your email. Miss the window and your spot goes to the next person on the reserve list.</p>
        <h2>Match scheduling</h2>
        <p>After accepting, submit your available dates and times using the scheduling form in your email. You and your opponent each submit availability and the system finds the earliest slot that works for both of you. If there's no overlap, the Tournament Director steps in.</p>
        <h2>Playing your match</h2>
        <p>Each round runs over a set window. You play with the tournament settings for that game. You must stream live on YouTube — the stream is mandatory. It's how we verify results and settle disputes.</p>
        <p>After the match, submit your score using the link emailed to you. Include your YouTube stream link. The winner advances. If you don't play within the window, you forfeit and your opponent advances.</p>
        <h2>The final</h2>
        <p>The last two players standing face off in the final. The winner gets the cash prize paid by EFT to a South African bank account, plus the title of Couch Cup Champion.</p>
        <h2>After the season</h2>
        <p>The bracket lives on the website. So does the winner's name. Follow us on socials and join the Discord to be first to know when the next tournament opens.</p>
      </div>
    </PageLayout>
  )
}
