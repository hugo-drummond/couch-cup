'use server'

import { sql } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const DASHBOARD_KEY = process.env.DASHBOARD_KEY

function assertKey(key: string | undefined) {
  if (!DASHBOARD_KEY || key !== DASHBOARD_KEY) {
    throw new Error('Unauthorized')
  }
}

export async function approvePost(id: string, key: string) {
  assertKey(key)
  await sql(
    `UPDATE blog_posts SET status = 'published', published_at = now() WHERE id = $1`,
    [id]
  )
  revalidatePath('/blog-admin')
  redirect(`/blog-admin?key=${encodeURIComponent(key)}`)
}

export async function rejectPost(id: string, key: string) {
  assertKey(key)
  await sql(
    `UPDATE blog_posts SET status = 'rejected' WHERE id = $1`,
    [id]
  )
  revalidatePath('/blog-admin')
  redirect(`/blog-admin?key=${encodeURIComponent(key)}`)
}
