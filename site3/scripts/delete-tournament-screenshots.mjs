// Usage: node scripts/delete-tournament-screenshots.mjs <tournament_id>
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const TOURNAMENT_ID = process.argv[2]
if (!TOURNAMENT_ID) {
  console.error('Usage: node scripts/delete-tournament-screenshots.mjs <tournament_id>')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: matchFolders, error: listError } = await supabase.storage
  .from('match-screenshots')
  .list(TOURNAMENT_ID, { limit: 1000 })

if (listError) {
  console.error('List error:', listError.message)
  process.exit(1)
}

if (!matchFolders?.length) {
  console.log(`No files found for tournament ${TOURNAMENT_ID}`)
  process.exit(0)
}

const allPaths = []
for (const item of matchFolders) {
  if (item.id === null) {
    const { data: files } = await supabase.storage
      .from('match-screenshots')
      .list(`${TOURNAMENT_ID}/${item.name}`, { limit: 1000 })
    if (files) allPaths.push(...files.map(f => `${TOURNAMENT_ID}/${item.name}/${f.name}`))
  } else {
    allPaths.push(`${TOURNAMENT_ID}/${item.name}`)
  }
}

if (!allPaths.length) {
  console.log('No files to delete.')
  process.exit(0)
}

const { error: removeError } = await supabase.storage.from('match-screenshots').remove(allPaths)
if (removeError) {
  console.error('Remove error:', removeError.message)
  process.exit(1)
}

console.log(`Deleted ${allPaths.length} files for tournament ${TOURNAMENT_ID}`)
