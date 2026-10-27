import { randomBytes } from 'crypto'
import { sql } from './supabase'

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function createMatchToken(
  playerId: string,
  matchId: string,
  type: 'scheduling' | 'submission' | 'proposal_accept' | 'proposal_decline' | 'forfeit_accept' | 'forfeit_decline',
  expiresInHours: number
): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()

  await sql(
    `INSERT INTO public.match_tokens (token, player_id, match_id, type, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, playerId, matchId, type, expiresAt]
  )

  return token
}

export async function createPlayerToken(
  playerId: string,
  tournamentId: string,
  type: 'acceptance',
  expiresInHours: number
): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()

  await sql(
    `INSERT INTO public.player_tokens (token, player_id, tournament_id, type, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, playerId, tournamentId, type, expiresAt]
  )

  return token
}

export async function validateToken(token: string, type: 'scheduling' | 'submission') {
  const rows = await sql<{
    id: string
    player_id: string
    match_id: string
    type: string
    expires_at: string
    used_at: string | null
  }>(
    `SELECT id, player_id, match_id, type, expires_at, used_at
     FROM public.match_tokens
     WHERE token = $1 AND type = $2`,
    [token, type]
  )

  if (!rows.length) return { valid: false, reason: 'not_found' } as const

  const row = rows[0]
  if (row.used_at) return { valid: false, reason: 'already_used' } as const
  if (new Date(row.expires_at) < new Date()) return { valid: false, reason: 'expired' } as const

  return { valid: true, playerId: row.player_id, matchId: row.match_id, tokenId: row.id } as const
}

export async function markTokenUsed(tokenId: string): Promise<void> {
  await sql(
    `UPDATE public.match_tokens SET used_at = now() WHERE id = $1`,
    [tokenId]
  )
}
