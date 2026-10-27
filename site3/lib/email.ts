import { Resend } from 'resend'
import { readFileSync } from 'fs'
import { join } from 'path'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { sql } from './supabase'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = `Couch Cup <${process.env.FROM_EMAIL}>`
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://couchcup.co.za'

const ses = new SESv2Client({ region: process.env.AWS_REGION ?? 'eu-north-1' })

async function sendEmail(opts: {
  to: string
  subject: string
  html?: string
  text?: string
  emailType?: string
  headers?: { Name: string; Value: string }[]
}) {
  const originalTo = opts.to
  const redirectTo = process.env.EMAIL_TEST_REDIRECT
  const finalTo = redirectTo || originalTo

  if (redirectTo) {
    console.log('[EMAIL_TEST_REDIRECT] original to:', originalTo)
  }

  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [finalTo] },
      Content: {
        Simple: {
          Subject: { Data: opts.subject },
          Body: {
            ...(opts.html ? { Html: { Data: opts.html } } : {}),
            ...(opts.text ? { Text: { Data: opts.text } } : {}),
          },
          ...(opts.headers ? { Headers: opts.headers } : {}),
        },
      },
    }))
  } catch (err) {
    console.error('[email] SES failed, falling back to Resend:', err)
    await resend.emails.send({
      from: FROM,
      to: finalTo,
      subject: opts.subject,
      ...(opts.html ? { html: opts.html } : {}),
      ...(opts.text ? { text: opts.text } : {}),
      ...(opts.headers ? { headers: Object.fromEntries(opts.headers.map(h => [h.Name, h.Value])) } : {}),
    } as any)
  }

  // Auto-log every successful outbound send. Non-blocking: a logging failure
  // must never break the actual email send. participant_id is resolved by
  // email (nullable FK — null when the recipient isn't a participant).
  await logEmail(finalTo, opts.emailType ?? 'other', opts.subject, opts.html ?? opts.text ?? null)
}

async function logEmail(to: string, emailType: string, subject: string, bodyHtml: string | null) {
  try {
    await sql(
      `INSERT INTO public.email_logs (id, participant_id, email_type, sent_at, direction, from_email, subject, body_html)
       VALUES (
         gen_random_uuid(),
         (SELECT id FROM public.participants WHERE lower(email) = lower($1) LIMIT 1),
         $2, now(), 'outbound', $3, $4, $5
       )`,
      [to, emailType, FROM, subject, bodyHtml]
    )
  } catch (err) {
    console.error('[email] log insert failed (send still succeeded):', err)
  }
}

export async function sendWaitlistConfirmationEmail(to: string, firstName: string) {
  const text = `Hi ${firstName},\n\nYou're registered for Couch Cup Season 2 (Fortnite Duos, Friday 28 August). Free entry, R500 each for the winning duo. If you named a partner, make sure they register too — otherwise we'll pair you at the draw.\n\nStay in the loop:\n- Discord: https://discord.gg/Kz4qrFUgKJ\n- Instagram: https://instagram.com/couchcup\n- TikTok: https://tiktok.com/@couchcup\n- YouTube: https://www.youtube.com/@couchcupp\n\nSee you on the field,\nThe Couch Cup Team\nhttps://couchcup.co.za`
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
  <p>Hi ${firstName},</p>
  <p>You're registered for Couch Cup Season 2 (Fortnite Duos, Friday 28 August). Free entry, R500 each for the winning duo.</p>
  <p>If you named a partner, make sure they register too — otherwise we'll pair you at the draw.</p>
  <p>Stay in the loop:</p>
  <ul>
    <li><a href="https://discord.gg/Kz4qrFUgKJ">Discord</a></li>
    <li><a href="https://instagram.com/couchcup">Instagram</a></li>
    <li><a href="https://tiktok.com/@couchcup">TikTok</a></li>
    <li><a href="https://www.youtube.com/@couchcupp">YouTube</a></li>
  </ul>
  <p>See you on the field,<br>The Couch Cup Team<br><a href="https://couchcup.co.za">couchcup.co.za</a></p>
</div>`
  await sendEmail({ to, subject: "You're registered — Couch Cup", html, text, emailType: 'waitlist_confirmation' })
}

export async function sendPaidEntryConfirmationEmail(to: string, firstName: string) {
  const text = `Hi ${firstName},\n\nYou're in for Couch Cup Season 2 (Fortnite Duos, Friday 28 August), R50 entry. Payment instructions land in your inbox shortly. If you named a partner, make sure they register too — otherwise we'll pair you at the draw.\n\nStay in the loop:\n- Discord: https://discord.gg/Kz4qrFUgKJ\n- Instagram: https://instagram.com/couchcup\n- TikTok: https://tiktok.com/@couchcup\n- YouTube: https://www.youtube.com/@couchcupp\n\nSee you on the field,\nThe Couch Cup Team\nhttps://couchcup.co.za`
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
  <p>Hi ${firstName},</p>
  <p>You're in for Couch Cup Season 2 (Fortnite Duos, Friday 28 August), R50 entry.</p>
  <p>Payment instructions land in your inbox shortly. If you named a partner, make sure they register too — otherwise we'll pair you at the draw.</p>
  <p>Stay in the loop:</p>
  <ul>
    <li><a href="https://discord.gg/Kz4qrFUgKJ">Discord</a></li>
    <li><a href="https://instagram.com/couchcup">Instagram</a></li>
    <li><a href="https://tiktok.com/@couchcup">TikTok</a></li>
    <li><a href="https://www.youtube.com/@couchcupp">YouTube</a></li>
  </ul>
  <p>See you on the field,<br>The Couch Cup Team<br><a href="https://couchcup.co.za">couchcup.co.za</a></p>
</div>`
  await sendEmail({ to, subject: "You're in — Couch Cup (R50 entry)", html, text, emailType: 'paid_entry_confirmation' })
}

export async function sendSelectionEmail(
  to: string,
  firstName: string,
  token: string
) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/selection-acceptance.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{ACCEPT_LINK}}', `${BASE_URL}/respond/${token}?action=accept`)
    .replace('{{DECLINE_LINK}}', `${BASE_URL}/respond/${token}?action=decline`)
  await sendEmail({
    to,
    subject: "You've been selected for Couch Cup",
    html,
    emailType: 'selection',
  })
}

export async function sendYoutubeSetupEmail(
  to: string,
  firstName: string
) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/youtube-streaming-setup.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace(/\{\{DISCORD_LINK\}\}/g, 'https://discord.gg/Kz4qrFUgKJ')
    .replace(/\{\{INSTAGRAM_LINK\}\}/g, 'https://www.instagram.com/couchcup')
  await sendEmail({
    to,
    subject: "Get your YouTube live stream ready — 24 hours before your match",
    html,
    emailType: 'youtube_setup',
  })
}

export async function sendAvailabilityReminderEmail(
  to: string,
  firstName: string,
  hoursLeft: number,
  token: string,
  includeStreamingAsk: boolean
) {
  const link = `${BASE_URL}/availability/${token}`
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/availability-reminder.html'), 'utf-8')
  const streamingHtml = includeStreamingAsk
    ? '<p>Please also give us your streaming URLs — drop your YouTube or Twitch channel URL on the same form. It helps us immensely with growing the brand.</p>'
    : ''
  const html = template
    .replace(/\{\{FIRST_NAME\}\}/g, firstName)
    .replace(/\{\{HOURS_LEFT\}\}/g, String(hoursLeft))
    .replace(/\{\{AVAILABILITY_LINK\}\}/g, link)
    .replace(/\{\{STREAMING_BLOCK\}\}/g, streamingHtml)
  const streamingText = includeStreamingAsk
    ? `\n\nPlease also give us your streaming URLs — drop your YouTube or Twitch channel URL on the same form. It helps us immensely with growing the brand.`
    : ''
  const text = `Hi ${firstName},\n\nRemember to submit your time slots for the next round. The link expires in ${hoursLeft} hours:\n\n${link}${streamingText}\n\nBigger brand, bigger prizes.\n\nThe Couch Cup Team\ncouchcup.co.za`
  await sendEmail({
    to,
    subject: 'Submit your time slots for your next match',
    html,
    text,
    emailType: 'availability_reminder',
  })
}

export async function sendSchedulingEmail(
  to: string,
  firstName: string,
  opponentPsn: string,
  token: string
) {
  const link = `${BASE_URL}/availability/${token}`
  await sendEmail({
    to,
    subject: 'Your match is ready — submit your availability',
    emailType: 'scheduling',
    text: `Hi ${firstName},\n\nYour Couch Cup match against ${opponentPsn} has been drawn. Submit your availability window in the next 12 hours:\n\n${link}\n\nSee you on the pitch,\nThe Couch Cup Team\ncouchcup.co.za`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
  <p>Hi ${firstName},</p>
  <p>Your Couch Cup match against <strong>${opponentPsn}</strong> has been drawn.</p>
  <p>Submit your availability window within the next 12 hours:</p>
  <p><a href="${link}" style="display:inline-block;background:#db1230;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Submit Availability</a></p>
  <p style="color:#666;font-size:13px">Link expires in 12 hours.</p>
  <p>See you on the pitch,<br><strong>The Couch Cup Team</strong><br><a href="https://couchcup.co.za" style="color:#db1230">couchcup.co.za</a></p>
</div>`,
  })
}

export async function sendScheduleConfirmationEmail(
  to: string,
  firstName: string,
  opponentPsn: string,
  scheduledAt: string,
  scoreToken: string
) {
  const scoreLink = `${BASE_URL}/match/${scoreToken}`
  const matchTime = new Date(scheduledAt).toLocaleString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Africa/Johannesburg',
  })
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/match-confirmation.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace(/\{\{OPPONENT_PSN\}\}/g, opponentPsn)
    .replace(/\{\{MATCH_TIME\}\}/g, matchTime)
    .replace('{{SCORE_LINK}}', scoreLink)

  await sendEmail({
    to,
    subject: `Your Match is Scheduled — Couch Cup 🎮`,
    emailType: 'schedule_confirmation',
    html,
  })
}

export async function sendScoreWindowOpenEmail(
  to: string,
  firstName: string,
  token: string
) {
  const link = `${BASE_URL}/match/${token}`
  await sendEmail({
    to,
    subject: 'Submit your score — 4 hours remaining',
    emailType: 'score_window_open',
    text: `Hi ${firstName},\n\nYour match has finished. Submit your score — you have 4 hours:\n\n${link}\n\nIf no score is submitted, we randomly select who proceeds to the next round.\n\nThe Couch Cup Team\ncouchcup.co.za`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
  <p>Hi ${firstName},</p>
  <p>Your match has finished. Submit your score — you have <strong>4 hours</strong>:</p>
  <p><a href="${link}" style="display:inline-block;background:#db1230;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Submit Score</a></p>
  <p style="font-size:14px;color:#555">If no score is submitted, we randomly select who proceeds to the next round.</p>
  <p>The Couch Cup Team<br><a href="https://couchcup.co.za" style="color:#db1230">couchcup.co.za</a></p>
</div>`,
  })
}

export async function sendOpponentEmail(
  to: string,
  firstName: string,
  opponentPsn: string,
  roundName: string,
  playWindow: string,
  schedulingDeadline: string,
  token: string,
  hasYoutube = false
) {
  // Only ask for a channel if we don't already have one for this player.
  const youtubeBlock = hasYoutube
    ? ''
    : `<p>We would love to stream your match to build hype around Couch Cup. If you're happy for us to stream from your channel please submit your YouTube or Twitch channel URL with the match scheduling link.</p>`

  const template = readFileSync(join(process.cwd(), 'lib/email-templates/opponent-announcement.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{OPPONENT_PSN}}', opponentPsn)
    .replace('{{ROUND_NAME}}', roundName)
    .replace('{{PLAY_WINDOW}}', playWindow)
    .replace('{{SCHEDULING_DEADLINE}}', schedulingDeadline)
    .replace('{{YOUTUBE_BLOCK}}', youtubeBlock)
    .replace('{{AVAILABILITY_LINK}}', `${BASE_URL}/availability/${token}`)

  await sendEmail({
    to,
    subject: `Your ${roundName} Opponent — Couch Cup 🎮 (24hrs to respond)`,
    emailType: 'opponent_announcement',
    html,
  })
}

export async function sendNoOverlapSuggestionEmail(
  to: string,
  firstName: string,
  suggestedTime: string,
  acceptToken: string,
  declineToken: string
) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/no-overlap-suggestion.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{SUGGESTED_TIME}}', suggestedTime)
    .replace('{{ACCEPT_LINK}}', `${BASE_URL}/proposal/${acceptToken}`)
    .replace('{{DECLINE_LINK}}', `${BASE_URL}/proposal/${declineToken}`)

  await sendEmail({
    to,
    subject: 'Your Couch Cup match time — please confirm',
    emailType: 'no_overlap_suggestion',
    html,
  })
}

export async function sendResubmitAvailabilityEmail(
  to: string,
  firstName: string,
  schedulingToken: string
) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/resubmit-availability.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{AVAILABILITY_LINK}}', `${BASE_URL}/availability/${schedulingToken}`)

  await sendEmail({
    to,
    subject: 'Submit more availability — Couch Cup',
    emailType: 'resubmit_availability',
    html,
  })
}

export async function sendInTheFinalEmail(to: string, firstName: string, finalDate: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/in-the-final.html'), 'utf-8')
  const html = template.replace('{{FIRST_NAME}}', firstName).replace('{{FINAL_DATE}}', finalDate)
  await sendEmail({ to, subject: "You're in the Final — Couch Cup 🎮", html, emailType: 'in_the_final' })
}

export async function sendRunnerUpEmail(to: string, firstName: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/runner-up.html'), 'utf-8')
  const html = template.replace('{{FIRST_NAME}}', firstName)
  await sendEmail({ to, subject: 'So Close — Couch Cup', html, emailType: 'runner_up' })
}

export async function sendChampionEmail(to: string, firstName: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/champion.html'), 'utf-8')
  const html = template.replace('{{FIRST_NAME}}', firstName)
  await sendEmail({ to, subject: "You're the Couch Cup Champion 🏆", html, emailType: 'champion' })
}

export async function sendEliminatedEmail(to: string, firstName: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/eliminated.html'), 'utf-8')
  const html = template.replace('{{FIRST_NAME}}', firstName)
  const text = `Hi ${firstName},\n\nGood game — that's the end of the road for you this time. You came and competed, and that's what Couch Cup is about.\n\nThanks for being part of Season 1. When the next one opens, you'll be first to hear from us.\n\nSee you on the pitch,\nThe Couch Cup Team\nhttps://couchcup.co.za`
  await sendEmail({
    to,
    subject: `Good game, ${firstName} — Couch Cup`,
    html,
    text,
    emailType: 'eliminated',
  })
}

export async function sendAdvancedEmail(to: string, firstName: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/advanced.html'), 'utf-8')
  const html = template.replace('{{FIRST_NAME}}', firstName)
  await sendEmail({
    to,
    subject: "You're Through — Couch Cup 🎮",
    emailType: 'advanced',
    html,
  })
}

export async function sendDupApologyEmail(to: string, firstName: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/dup-correction-apology.html'), 'utf-8')
  const html = template.replace('{{FIRST_NAME}}', firstName)
  await sendEmail({
    to,
    subject: 'Sorry about that — ignore our last email',
    emailType: 'dup_correction_apology',
    html,
  })
}

export async function sendDupScheduleEmail(to: string, firstName: string, token: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/dup-correction-schedule.html'), 'utf-8')
  const link = `${BASE_URL}/availability/${token}`
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace(/\{\{AVAILABILITY_LINK\}\}/g, link)
  const text = `Hi ${firstName},\n\nQuick one. Our system hiccuped and re-sent you an old result email by mistake. Ignore that one.\n\nThe bit that matters: you're through to the Quarter-finals. All you need to do now is tell us when you're free to play.\n\nSubmit your availability here:\n${link}\n\nYou've got 24 hours from your Quarter-final email to submit. Miss the deadline and your opponent advances by default.\n\nGood luck.\n\nSee you on the pitch,\nThe Couch Cup Team\ncouchcup.co.za`
  await sendEmail({
    to,
    subject: 'Ignore that last email — just lock in your match time',
    emailType: 'dup_correction_schedule',
    html,
    text,
  })
}

export async function sendMatchDayNoticeEmail(to: string, firstName: string, opponentPsn: string, matchTime: string, sameDay: boolean) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/match-reminder-12h.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{OPPONENT_PSN}}', opponentPsn)
    .replace('{{MATCH_TIME}}', matchTime)
  await sendEmail({
    to,
    subject: sameDay
      ? `Your Couch Cup match is today — here's what you need to know`
      : `Your Couch Cup match is tomorrow — here's what you need to know`,
    html,
    emailType: 'match_day_notice',
  })
}

export async function sendMatchReminder2h(to: string, firstName: string, opponentPsn: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/match-reminder-2h.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{OPPONENT_PSN}}', opponentPsn)
  await sendEmail({
    to,
    subject: `Your Couch Cup match is in 2 hours — get ready`,
    emailType: 'match_reminder_2h',
    html,
  })
}

export async function sendForfeitWarningEmail(
  to: string,
  firstName: string,
  opponentPsn: string,
  scheduledAt: string,
  acceptToken: string,
  declineToken: string
) {
  const matchTime = new Date(scheduledAt).toLocaleString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Africa/Johannesburg',
  })
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/forfeit-warning.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{OPPONENT_PSN}}', opponentPsn)
    .replace('{{MATCH_TIME}}', matchTime)
    .replace('{{ACCEPT_LINK}}', `${BASE_URL}/forfeit/${acceptToken}`)
    .replace('{{DECLINE_LINK}}', `${BASE_URL}/forfeit/${declineToken}`)
  await sendEmail({
    to,
    subject: `Confirm your Couch Cup match time`,
    emailType: 'forfeit_warning',
    html,
  })
}

export async function sendRematchEmail(to: string, firstName: string, opponentPsn: string, token: string) {
  const scoreLink = `${BASE_URL}/match/${token}`
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/rematch.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{OPPONENT_PSN}}', opponentPsn)
    .replace('{{SCORE_LINK}}', scoreLink)
  await sendEmail({
    to,
    subject: `It was a draw, rematch now`,
    emailType: 'rematch',
    html,
  })
}

export async function sendInviteSenderEmail(to: string, firstName: string, opponentPsn: string, matchTime: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/invite-sender.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace(/\{\{OPPONENT_PSN\}\}/g, opponentPsn)
    .replace('{{MATCH_TIME}}', matchTime)
  await sendEmail({
    to,
    subject: `You're sending the invite`,
    emailType: 'invite_sender',
    html,
  })
}

export async function sendInviteReceiverEmail(to: string, firstName: string, opponentPsn: string, matchTime: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/invite-receiver.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace(/\{\{OPPONENT_PSN\}\}/g, opponentPsn)
    .replace('{{MATCH_TIME}}', matchTime)
  await sendEmail({
    to,
    subject: `Sit back, your opponent sends the invite`,
    emailType: 'invite_receiver',
    html,
  })
}

export async function sendSelectionReminderEmail(
  to: string,
  firstName: string,
  token: string,
  expiresAt: string
) {
  const acceptLink = `${BASE_URL}/respond/${token}?action=accept`
  const text = `Hi ${firstName},

You haven't confirmed your Couch Cup spot yet. You've got until ${expiresAt} to accept, otherwise it goes to the next person on the list.

Confirm here: ${acceptLink}

Any questions, reply to this email.

The Couch Cup Team`
  await sendEmail({
    to,
    subject: 'Confirm your Couch Cup spot',
    text,
    emailType: 'selection_reminder',
  })
}

export async function sendDiscordNudgeEmail(to: string, firstName: string) {
  const text = `Hey ${firstName},

Quick one — are you in the Discord yet?

That's where we coordinate everything: fixture times, bracket updates, match reminders. If you're not in there, you're going to miss things that won't go out over email.

discord.gg/Kz4qrFUgKJ

It takes 30 seconds.

See you on the pitch,
The Couch Cup Team
couchcup.co.za`
  await sendEmail({
    to,
    subject: 'Are you in the Discord yet?',
    text,
    emailType: 'discord_nudge',
  })
}

export async function sendSeason2TeaserEmail(to: string, firstName: string) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/season2-teaser.html'), 'utf-8')
  const html = template.replace(/\{\{FIRST_NAME\}\}/g, firstName)
  const text = `Hi ${firstName},

Couch Cup Season 1 has come to an end and we have our champion. Thanks for being part of it.

We're already putting Season 2 together. More on that soon.

In the meantime you can follow us on Instagram and join the Discord:
- Instagram: https://instagram.com/couchcup
- Discord: https://discord.gg/Kz4qrFUgKJ

Regards,
The Couch Cup Team
couchcup.co.za`
  await sendEmail({
    to,
    subject: 'Season 1 wrapped — Season 2 next',
    html,
    text,
    emailType: 'season2_teaser',
  })
}

export async function sendTournamentInviteEmail(
  to: string,
  firstName: string,
  token: string,
  tournament: { name: string; game: string; prize: string }
) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/tournament-invite.html'), 'utf-8')
  const signupLink = `${BASE_URL}/invite/${token}?action=signup`
  const notInterestedLink = `${BASE_URL}/invite/${token}?action=not_interested`
  const html = template
    .replace(/\{\{FIRST_NAME\}\}/g, firstName)
    .replace(/\{\{TOURNAMENT_NAME\}\}/g, tournament.name)
    .replace(/\{\{GAME\}\}/g, tournament.game)
    .replace(/\{\{PRIZE\}\}/g, tournament.prize)
    .replace(/\{\{SIGNUP_LINK\}\}/g, signupLink)
    .replace(/\{\{NOT_INTERESTED_LINK\}\}/g, notInterestedLink)
  const text = `Hi ${firstName},

Season 2 is on — ${tournament.game}, free to enter, ${tournament.prize} for the winning duo. Thought you'd want first dibs.

If you're in, sign up here and add your Epic username — grab a partner or we'll pair you at the draw:
${signupLink}

We'll email your match details once the bracket's set.

Regards,
The Couch Cup Team
couchcup.co.za

Not playing this one? Let us know here and we'll skip you for ${tournament.name}: ${notInterestedLink}`
  await sendEmail({
    to,
    subject: `${tournament.name} is on — you in?`,
    html,
    text,
    emailType: 'tournament_invite',
  })
}

export async function sendAdminFlagEmail(subject: string, body: string) {
  if (!process.env.ADMIN_EMAIL) {
    console.warn('ADMIN_EMAIL not set; admin flag email skipped')
    return
  }
  await sendEmail({
    to: process.env.ADMIN_EMAIL!,
    subject,
    text: body,
    emailType: 'admin_flag',
  })
}

export async function sendAvailabilityConfirmationEmail(
  to: string,
  firstName: string,
  windows: { date: string; startTime: string; endTime: string }[]
) {
  // Group submitted windows by date; sort dates and the time ranges within each day.
  const byDate = new Map<string, { startTime: string; endTime: string }[]>()
  for (const w of windows) {
    if (!byDate.has(w.date)) byDate.set(w.date, [])
    byDate.get(w.date)!.push({ startTime: w.startTime, endTime: w.endTime })
  }
  const rows = [...byDate.keys()].sort().map(date => {
    const label = new Date(`${date}T12:00:00+02:00`).toLocaleDateString('en-ZA', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg',
    })
    const ranges = byDate.get(date)!
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(r => `${r.startTime} – ${r.endTime}`)
      .join(', ')
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong>${label}:</strong> ${ranges}</td></tr>`
  }).join('')

  const template = readFileSync(join(process.cwd(), 'lib/email-templates/availability-confirmation.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{SLOTS}}', rows)

  await sendEmail({
    to,
    subject: 'Your availability is in — Couch Cup 🎮',
    emailType: 'availability_confirmation',
    html,
  })
}

export async function sendPromotionEmail(to: string, firstName: string) {
  const text = `Hi ${firstName},\n\nBoth players in one of this round's matches forfeited. We've gifted you a wild card and you're back in!\n\nYour next match details will follow shortly. Good luck!\n\nRegards,\nCouch Cup\nhttps://couchcup.co.za`
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
  <p>Hi ${firstName},</p>
  <p>Both players in one of this round's matches forfeited. We've gifted you a wild card and you're back in!</p>
  <p>Your next match details will follow shortly. Good luck!</p>
  <p style="margin-top:24px">Regards,<br><strong>Couch Cup</strong><br><a href="https://couchcup.co.za" style="color:#db1230">couchcup.co.za</a></p>
</div>`
  await sendEmail({ to, subject: "You've been promoted to the next round", html, text, emailType: 'promotion' })
}

export async function sendScoreConfirmationEmail(
  to: string,
  firstName: string,
  yourScore: number,
  oppScore: number,
  opponentPsn: string,
  link: string
) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/score-confirmation.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{YOUR_SCORE}}', String(yourScore))
    .replace('{{OPP_SCORE}}', String(oppScore))
    .replace('{{OPPONENT_PSN}}', opponentPsn)
    .replace('{{SCORE_LINK}}', link)

  await sendEmail({
    to,
    subject: 'Score received — Couch Cup',
    html,
    emailType: 'score_confirmation',
  })
}

export async function sendScoreReminderEmail(
  to: string,
  firstName: string,
  link: string
) {
  const template = readFileSync(join(process.cwd(), 'lib/email-templates/score-reminder.html'), 'utf-8')
  const html = template
    .replace('{{FIRST_NAME}}', firstName)
    .replace('{{SCORE_LINK}}', link)

  await sendEmail({
    to,
    subject: 'Reminder: submit your score — Couch Cup',
    html,
    emailType: 'score_reminder',
  })
}
