import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = {}
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (match) env[match[1].trim()] = match[2].replace(/\\n$/, '').trim()
})

async function sql(q) {
  const res = await fetch('https://api.supabase.com/v1/projects/rnoavvjxiozlyrulffal/database/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.SUPABASE_MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q })
  })
  const data = await res.json()
  if (data?.message) throw new Error(data.message)
  return data
}

await sql(`CREATE TABLE IF NOT EXISTS public.cron_lock (
  id text PRIMARY KEY,
  locked_at timestamptz,
  expires_at timestamptz
)`)
console.log('✓ cron_lock table created')

await sql(`INSERT INTO public.cron_lock (id) VALUES ('advance') ON CONFLICT (id) DO NOTHING`)
console.log("✓ cron_lock 'advance' row seeded")
