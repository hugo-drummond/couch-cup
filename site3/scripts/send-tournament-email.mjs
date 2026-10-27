import { Resend } from 'resend'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env.local manually
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, '..', '.env.local')
const env = {}
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (match) env[match[1].trim()] = match[2].replace(/\\n$/, '').trim()
})

const resend = new Resend(env.RESEND_API_KEY)
const ses = new SESv2Client({
  region: env.AWS_REGION ?? 'eu-north-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
})

const SUPABASE_URL = 'https://api.supabase.com/v1/projects/rnoavvjxiozlyrulffal/database/query'
const SUPA_TOKEN = env.SUPABASE_MANAGEMENT_TOKEN
const FROM = `Couch Cup <${env.FROM_EMAIL}>`
const LOGO_URL = 'https://couchcup.co.za/images/logo-new.png'

async function query(sql) {
  const res = await fetch(SUPABASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  return res.json()
}

async function getParticipants() {
  return query(`SELECT id, name, email FROM public.participants WHERE is_eligible = true`)
}

async function logEmail(participantId, resendId) {
  await query(`
    INSERT INTO public.email_logs (participant_id, email_type, direction, subject, email_url)
    VALUES (
      '${participantId}',
      'tournament_announcement',
      'outbound',
      'Quick update from Couch Cup',
      ${resendId ? `'https://resend.com/emails/${resendId}'` : 'NULL'}
    )
  `)
}

function buildHtml(firstName) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:#050d3d;padding:28px 40px;text-align:center">
            <img src="${LOGO_URL}" alt="Couch Cup" width="160" style="display:block;margin:0 auto">
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 24px;color:#1a1a1a;font-size:16px;line-height:1.6">
            <p style="margin:0 0 16px">Hey ${firstName},</p>
            <p style="margin:0 0 16px">Couch Cup's first tournament is almost here. Participants get announced soon. Keep an eye out.</p>
            <p style="margin:0 0 24px">One thing worth doing before then: join our Discord. That's where we coordinate match times, post bracket updates, and keep things moving.</p>

            <!-- Discord CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px">
              <tr>
                <td style="background:#5865F2;border-radius:6px;padding:14px 28px">
                  <a href="https://discord.gg/Kz4qrFUgKJ" style="color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;display:block">Join the Discord</a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 16px;color:#555;font-size:14px">Stay in the loop:</p>

            <!-- Socials -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
              <tr>
                <td style="padding:6px 0">
                  <a href="https://instagram.com/couchcup" style="color:#E1306C;font-weight:600;text-decoration:none;font-size:15px">Instagram</a>
                  <span style="color:#999;font-size:15px"> — @couchcup</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0">
                  <a href="https://tiktok.com/@couchcup" style="color:#000000;font-weight:600;text-decoration:none;font-size:15px">TikTok</a>
                  <span style="color:#999;font-size:15px"> — @couchcup</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0">
                  <a href="https://www.youtube.com/@couchcupp" style="color:#FF0000;font-weight:600;text-decoration:none;font-size:15px">YouTube</a>
                  <span style="color:#999;font-size:15px"> — @couchcupp</span>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#555">See you on the pitch,</p>
            <p style="margin:8px 0 0;font-weight:700;color:#050d3d">The Couch Cup Team</p>
            <p style="margin:4px 0 0"><a href="https://couchcup.co.za" style="color:#db1230;text-decoration:none;font-size:14px">couchcup.co.za</a></p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#050d3d;padding:20px 40px;text-align:center">
            <img src="${LOGO_URL}" alt="Couch Cup" width="100" style="display:block;margin:0 auto 12px">
            <p style="margin:0;color:#ffffff;opacity:0.5;font-size:12px">couchcup.co.za</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildText(firstName) {
  return `Hey ${firstName},

Couch Cup's first tournament is almost here. Participants get announced soon. Keep an eye out.

One thing worth doing before then: join our Discord. That's where we coordinate match times, post bracket updates, and keep things moving.

https://discord.gg/Kz4qrFUgKJ

Stay in the loop:
- Instagram: https://instagram.com/couchcup
- TikTok: https://tiktok.com/@couchcup
- YouTube: https://www.youtube.com/@couchcupp

See you on the pitch,
The Couch Cup Team
https://couchcup.co.za
Email: hello@couchcup.co.za`
}

async function sendTransport(opts) {
  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: opts.from,
      Destination: { ToAddresses: [opts.to] },
      Content: {
        Simple: {
          Subject: { Data: opts.subject },
          Body: {
            ...(opts.html ? { Html: { Data: opts.html } } : {}),
            ...(opts.text ? { Text: { Data: opts.text } } : {}),
          },
        },
      },
    }))
    return { data: { id: 'ses' }, error: null }
  } catch (err) {
    console.error('[email] SES failed, falling back to Resend:', err)
    return resend.emails.send({
      from: opts.from,
      replyTo: opts.replyTo,
      to: opts.to,
      subject: opts.subject,
      ...(opts.html ? { html: opts.html } : {}),
      ...(opts.text ? { text: opts.text } : {}),
      headers: opts.headers,
    })
  }
}

async function sendEmail(name, email, plainTextOnly = false) {
  const firstName = name.split(' ')[0]
  const result = await sendTransport({
    from: FROM,
    replyTo: 'hello@couchcup.co.za',
    to: email,
    subject: "Quick update from Couch Cup",
    ...(plainTextOnly ? {} : { html: buildHtml(firstName) }),
    text: buildText(firstName),
    headers: {
      'List-Unsubscribe': '<mailto:hello@couchcup.co.za?subject=unsubscribe>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  return result
}

// ── Entry point ──────────────────────────────────────────────
const isTest = process.argv[2] === '--test'
const testEmail = process.argv[3]

if (isTest && testEmail) {
  console.log(`Sending test to ${testEmail}...`)
  const r = await sendEmail('Player', testEmail, false)
  console.log('Result:', JSON.stringify(r, null, 2))
} else if (!isTest) {
  const participants = await getParticipants()
  if (!Array.isArray(participants)) {
    console.error('Failed to fetch participants:', participants)
    process.exit(1)
  }
  console.log(`Sending to ${participants.length} participants...`)
  for (const p of participants) {
    const r = await sendEmail(p.name, p.email)
    if (r.error) {
      console.log(`${p.email}: ERROR: ${r.error.message}`)
    } else {
      await logEmail(p.id, r.data?.id)
      console.log(`${p.email}: OK (${r.data?.id})`)
    }
    await new Promise(res => setTimeout(res, 300))
  }
  console.log('Done.')
} else {
  console.log('Usage:')
  console.log('  Test:  node scripts/send-tournament-email.mjs --test player-two@example.com')
  console.log('  Live:  node scripts/send-tournament-email.mjs')
}
