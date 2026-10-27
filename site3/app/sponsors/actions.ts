'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { Sponsor, SponsorInput, Stage } from './types'
import { SPONSOR_COLS } from './types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Normalise empty strings to null so the DB stays clean.
function clean(input: SponsorInput): SponsorInput {
  const out = { ...input } as Record<string, unknown>
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string' && (out[k] as string).trim() === '') out[k] = null
  }
  return out as SponsorInput
}

export async function createSponsor(
  input: SponsorInput
): Promise<{ data?: Sponsor; error?: string }> {
  const payload = clean(input)
  if (!payload.company_name) return { error: 'Company name is required.' }

  const { data, error } = await supabase
    .from('sponsors')
    .insert(payload)
    .select(SPONSOR_COLS)
    .single()

  if (error) return { error: error.message }
  revalidatePath('/sponsors')
  return { data: data as Sponsor }
}

export async function updateSponsor(
  id: string,
  input: SponsorInput
): Promise<{ data?: Sponsor; error?: string }> {
  const payload = clean(input)
  if (!payload.company_name) return { error: 'Company name is required.' }

  const { data, error } = await supabase
    .from('sponsors')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SPONSOR_COLS)
    .single()

  if (error) return { error: error.message }
  revalidatePath('/sponsors')
  return { data: data as Sponsor }
}

export async function moveSponsor(
  id: string,
  stage: Stage
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('sponsors')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/sponsors')
  return {}
}

export async function deleteSponsor(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('sponsors').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/sponsors')
  return {}
}
