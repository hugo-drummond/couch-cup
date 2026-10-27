import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Stateless, signed invite tokens for the tournament-invite email flow.
 *
 * The marketing audience is `participants ∪ players` — many recipients have no
 * `players` row yet, so we can't key a DB token off `player_id`. Instead we sign
 * `{email, tournamentId}` with INTERNAL_API_SECRET (HMAC-SHA256). Zero rows are
 * written at send time; the /invite endpoint lazily creates the player on click.
 *
 * The action (signup / not_interested) rides in the URL query string, exactly
 * like sendSelectionEmail's `?action=` — both are the recipient's own low-stakes,
 * idempotent choices, so leaving action unsigned is consistent with that pattern.
 */

interface InvitePayload {
  email: string
  tournamentId: string
}

function secret(): string {
  return process.env.INTERNAL_API_SECRET ?? ''
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', secret()).update(payload).digest())
}

export function signInviteToken(email: string, tournamentId: string): string {
  const payload = b64url(JSON.stringify({ e: email.toLowerCase().trim(), t: tournamentId }))
  return `${payload}.${sign(payload)}`
}

export function verifyInviteToken(token: string): InvitePayload | null {
  const [payload, sig] = (token ?? '').split('.')
  if (!payload || !sig) return null

  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const { e, t } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
    if (typeof e !== 'string' || typeof t !== 'string' || !e || !t) return null
    return { email: e, tournamentId: t }
  } catch {
    return null
  }
}
