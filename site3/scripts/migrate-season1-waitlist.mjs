/**
 * migrate-season1-waitlist.mjs
 *
 * Migrates participants → players + waitlist_entries for Couch Cup Season 1.
 *
 * Default: DRY RUN (read-only, prints what would happen).
 * Pass --live to execute writes.
 *
 * Idempotent: safe to rerun in either mode.
 *
 * Hard guardrails (enforced here, not by flag):
 *   - No random draw / selection logic
 *   - Everyone lands status='waitlist'
 *   - No token minting
 *   - No emails
 *   - No modifications to the participants table
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = {}
readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=["']?(.+?)["']?$/)
  if (match) env[match[1].trim()] = match[2].replace(/\\n$/, '').trim()
})

const LIVE = process.argv.includes('--live')

async function sql(q) {
  const res = await fetch('https://api.supabase.com/v1/projects/rnoavvjxiozlyrulffal/database/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: q })
  })
  const data = await res.json()
  if (data?.message) throw new Error(data.message)
  return data
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TOURNAMENT_NAME = 'Couch Cup Season 1'
const XBOX_FILTER = `(psn_id ILIKE '%xbox%' OR name ILIKE '%xbox%')`
const TEST_EMAILS = ['player-one@example.com', 'player-two@example.com']

// ---------------------------------------------------------------------------
// Step 1: Resolve tournament
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`)
console.log(`  Couch Cup Season 1 — DB Migration`)
console.log(`  Mode: ${LIVE ? '*** LIVE — WRITES ENABLED ***' : 'DRY RUN (read-only)'}`)
console.log(`${'='.repeat(60)}\n`)

console.log(`[1] Resolving tournament "${TOURNAMENT_NAME}" ...`)

const existingTournaments = await sql(`
  SELECT id, name, status
  FROM public.tournaments
  WHERE name = '${TOURNAMENT_NAME}'
  LIMIT 1
`)

let tournamentId
let tournamentAction

if (existingTournaments.length > 0) {
  tournamentId = existingTournaments[0].id
  tournamentAction = 'REUSE'
  console.log(`    → REUSE existing: id=${tournamentId}, status=${existingTournaments[0].status}`)
} else {
  tournamentAction = 'CREATE'
  if (LIVE) {
    const created = await sql(`
      INSERT INTO public.tournaments (name, game, max_participants, status)
      VALUES ('${TOURNAMENT_NAME}', 'EA FC 26', 32, 'pending')
      RETURNING id
    `)
    tournamentId = created[0].id
    console.log(`    → CREATED: id=${tournamentId}`)
  } else {
    tournamentId = '<will-be-generated>'
    console.log(`    → DRY RUN: would CREATE tournament "${TOURNAMENT_NAME}" (game=EA FC 26, max=32, status=pending)`)
  }
}

// ---------------------------------------------------------------------------
// Step 2: Fetch eligible participants (exclude xbox)
// ---------------------------------------------------------------------------
console.log(`\n[2] Fetching eligible participants (excluding xbox) ...`)

const participants = await sql(`
  SELECT
    id,
    name,
    email,
    psn_id,
    discord_id,
    mobile,
    date_of_birth,
    country,
    is_eligible,
    marketing_opt_in,
    signup_timestamp
  FROM public.participants
  WHERE NOT ${XBOX_FILTER}
  ORDER BY signup_timestamp ASC
`)

const excluded = await sql(`
  SELECT name, psn_id
  FROM public.participants
  WHERE ${XBOX_FILTER}
`)

console.log(`    → Eligible: ${participants.length}`)
console.log(`    → Excluded (${excluded.length}):`)
for (const x of excluded) {
  console.log(`        • ${x.name} (psn_id: "${x.psn_id}")`)
}

// ---------------------------------------------------------------------------
// Step 3: Fetch existing players keyed by lower(trim(email))
// ---------------------------------------------------------------------------
console.log(`\n[3] Checking existing players table ...`)

const existingPlayers = await sql(`
  SELECT id, lower(trim(email)) AS email_key
  FROM public.players
`)

const existingPlayerMap = {}
for (const p of existingPlayers) {
  existingPlayerMap[p.email_key] = p.id
}
console.log(`    → Players already in DB: ${existingPlayers.length}`)

// ---------------------------------------------------------------------------
// Step 4: Plan player upserts
// ---------------------------------------------------------------------------
const playersToInsert = []
const playersToReuse = []
const emailCollisions = []

for (const p of participants) {
  const emailKey = p.email ? p.email.toLowerCase().trim() : null
  if (!emailKey) {
    console.warn(`    WARN: participant "${p.name}" has no email — skipping`)
    continue
  }
  if (existingPlayerMap[emailKey]) {
    playersToReuse.push({ participant: p, playerId: existingPlayerMap[emailKey] })
    if (TEST_EMAILS.includes(emailKey)) {
      emailCollisions.push({ name: p.name, email: emailKey, existingId: existingPlayerMap[emailKey] })
    }
  } else {
    playersToInsert.push(p)
  }
}

console.log(`\n[4] Player upsert plan:`)
console.log(`    → To INSERT: ${playersToInsert.length}`)
console.log(`    → To REUSE:  ${playersToReuse.length}`)
if (emailCollisions.length > 0) {
  console.log(`    → Email collisions with test players:`)
  for (const c of emailCollisions) {
    console.log(`        • "${c.name}" (${c.email}) → reuse id=${c.existingId}`)
  }
}

// ---------------------------------------------------------------------------
// Step 5: Fetch existing waitlist_entries for this tournament (idempotency)
// ---------------------------------------------------------------------------
console.log(`\n[5] Checking existing waitlist_entries for this tournament ...`)

let existingWaitlistSet = new Set()
if (!LIVE || tournamentId !== '<will-be-generated>') {
  // In dry run, tournament doesn't exist yet so no entries can exist
  if (tournamentAction === 'REUSE') {
    const existingEntries = await sql(`
      SELECT player_id
      FROM public.waitlist_entries
      WHERE tournament_id = '${tournamentId}'
    `)
    for (const e of existingEntries) {
      existingWaitlistSet.add(e.player_id)
    }
    console.log(`    → Existing entries for this tournament: ${existingWaitlistSet.size}`)
  } else {
    console.log(`    → Tournament doesn't exist yet — 0 existing entries`)
  }
}

// ---------------------------------------------------------------------------
// Step 6: Execute or simulate writes
// ---------------------------------------------------------------------------
console.log(`\n[6] ${LIVE ? 'Executing' : 'Simulating'} player inserts + waitlist_entry inserts ...`)

// We'll build a map: email_key → final player_id (for waitlist inserts)
const playerIdMap = {}

// Preload reuse entries into the map
for (const { participant: p, playerId } of playersToReuse) {
  const emailKey = p.email.toLowerCase().trim()
  playerIdMap[emailKey] = playerId
}

let playersInserted = 0
let waitlistInserted = 0
let waitlistSkipped = 0

if (LIVE) {
  // --- LIVE: insert players one by one (idempotent: check again before insert) ---
  for (const p of playersToInsert) {
    const emailKey = p.email.toLowerCase().trim()

    // Double-check in case of concurrent runs
    const check = await sql(`
      SELECT id FROM public.players
      WHERE lower(trim(email)) = '${emailKey.replace(/'/g, "''")}'
      LIMIT 1
    `)

    let pid
    if (check.length > 0) {
      pid = check[0].id
      // Don't double-count as insert
    } else {
      const escName = (p.name || '').replace(/'/g, "''")
      const escEmail = (p.email || '').replace(/'/g, "''")
      const escPsn = (p.psn_id || '').replace(/'/g, "''")
      const escDiscord = p.discord_id ? `'${p.discord_id.replace(/'/g, "''")}'` : 'NULL'
      const escMobile = p.mobile ? `'${p.mobile.replace(/'/g, "''")}'` : 'NULL'
      const escDob = p.date_of_birth ? `'${p.date_of_birth}'` : 'NULL'
      const escCountry = p.country ? `'${p.country.replace(/'/g, "''")}'` : 'NULL'
      const isEligible = p.is_eligible === true || p.is_eligible === 'true' ? 'true' : 'false'
      const mktOpt = p.marketing_opt_in === true || p.marketing_opt_in === 'true' ? 'true' : 'false'

      const inserted = await sql(`
        INSERT INTO public.players
          (name, email, psn_id, discord_id, mobile, date_of_birth, country, is_eligible, marketing_opt_in)
        VALUES
          ('${escName}', '${escEmail}', '${escPsn}', ${escDiscord}, ${escMobile}, ${escDob}, ${escCountry}, ${isEligible}, ${mktOpt})
        RETURNING id
      `)
      pid = inserted[0].id
      playersInserted++
    }
    playerIdMap[emailKey] = pid
  }

  // --- LIVE: insert waitlist_entries ---
  // Combine all players (inserted + reused) → waitlist entries
  for (const p of participants) {
    const emailKey = p.email ? p.email.toLowerCase().trim() : null
    if (!emailKey || !playerIdMap[emailKey]) continue

    const pid = playerIdMap[emailKey]

    if (existingWaitlistSet.has(pid)) {
      waitlistSkipped++
      continue
    }

    const signupTs = p.signup_timestamp ? `'${p.signup_timestamp}'` : 'now()'

    await sql(`
      INSERT INTO public.waitlist_entries
        (player_id, tournament_id, status, signup_timestamp, selected_at, accepted_at)
      VALUES
        ('${pid}', '${tournamentId}', 'waitlist', ${signupTs}, NULL, NULL)
    `)
    waitlistInserted++
  }

} else {
  // --- DRY RUN: simulate counts ---
  playersInserted = playersToInsert.length

  // All participants resolved to player IDs (simulated)
  const allResolvedCount = playersToInsert.length + playersToReuse.length

  // For waitlist: skip anyone already in existing set
  // (In dry run with CREATE tournament, existingWaitlistSet is empty → all are new)
  for (const p of participants) {
    const emailKey = p.email ? p.email.toLowerCase().trim() : null
    if (!emailKey) continue
    // Simulate player id lookup
    const pid = existingPlayerMap[emailKey] || '__new__'
    if (existingWaitlistSet.has(pid)) {
      waitlistSkipped++
    } else {
      waitlistInserted++
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`)
console.log(`  SUMMARY — ${LIVE ? 'LIVE RUN' : 'DRY RUN'}`)
console.log(`${'='.repeat(60)}`)
console.log(`  Tournament "${TOURNAMENT_NAME}":       ${tournamentAction}`)
if (LIVE && tournamentId !== '<will-be-generated>') {
  console.log(`  Tournament ID:                    ${tournamentId}`)
}
console.log(`  Eligible participants:             ${participants.length}`)
console.log(`  Excluded (xbox):                  ${excluded.length}`)
console.log(`  Players to INSERT:                ${LIVE ? playersInserted : playersToInsert.length}`)
console.log(`  Players to REUSE:                 ${playersToReuse.length}`)
console.log(`  waitlist_entries to INSERT:       ${waitlistInserted}`)
console.log(`  waitlist_entries already present: ${waitlistSkipped}`)
console.log(`  Everyone lands status:            'waitlist'`)
console.log(`  Tokens minted:                    0`)
console.log(`  Emails sent:                      0`)
console.log(`  participants table modified:      NO`)
console.log(`${'='.repeat(60)}\n`)

if (!LIVE) {
  console.log('DRY RUN complete. No writes made. Pass --live to execute.\n')
}
