# Couch Cup — Discord Bot Reference

## Overview
- **Path:** `~/couch-cup/bot/`
- **Runtime:** Node.js (ESM), Discord.js v14
- **Entry:** `src/index.js`
- **Start:** `npm start` (prod) | `npm run dev` (watch mode)
- **Deploy commands:** `npm run deploy-commands` (registers slash commands with Discord)
- **Hosting:** Local for now — intended for Railway

---

## Environment Variables (`bot/.env`)

```
DISCORD_BOT_TOKEN=          # Bot token from Discord Developer Portal
DISCORD_CLIENT_ID=          # Application ID from the Developer Portal

SUPABASE_URL=               # https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=        # Supabase secret API key (sb_secret_...)

TOURNAMENT_DIRECTOR_DISCORD_ID=   # Discord user ID of the tournament director

# ── PRODUCTION ──────────────────────────────────────
DISCORD_GUILD_ID=
ANNOUNCEMENTS_CHANNEL_ID=
MATCH_SCHEDULING_CHANNEL_ID=
MOD_LOG_CHANNEL_ID=
COUCH_CUP_ADMIN_ROLE_ID=
BRACKET_PLAYER_ROLE_ID=
VETERAN_ROLE_ID=

# ── DEVELOPMENT ─────────────────────────────────────
# Same seven IDs again, pointing at a throwaway test server.
DEV_GUILD_ID=
DEV_ANNOUNCEMENTS_CHANNEL_ID=
DEV_MATCH_SCHEDULING_CHANNEL_ID=
DEV_MOD_LOG_CHANNEL_ID=
DEV_ADMIN_ROLE_ID=
DEV_BRACKET_PLAYER_ROLE_ID=
DEV_VETERAN_ROLE_ID=

NODE_ENV=development        # set to 'production' on Railway
TEST_MODE=true              # shortens all time windows (see below)
```

---

## Config (`src/config.js`)

All commands use `config.*` — never `process.env.*` directly.

| Key | Dev value | Prod value |
|-----|-----------|------------|
| `matchWindowMs` | 3 min | 48 hours |
| `matchWindowLabel` | '3 minutes' | '48 hours' |
| `proposalCutoffMs` | 30 sec | 15 min |
| `scoreWindowMs` | 1 min | 2 hours |
| `scoreWindowLabel` | '1 minute' | '2 hours' |

`TEST_MODE=true` activates shortened windows without changing `NODE_ENV`.

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/sync` | Syncs waitlisted participants from Supabase into the bracket (assigns roles) |
| `/bracket generate` | Generates the bracket for the active tournament |
| `/round open` | Opens the current round — posts match threads in #match-scheduling |
| `/round close` | Closes the current round (marks all pending matches as forfeits) |
| `/score` | Player submits their match score via modal |
| `/admin` | Admin subcommands (see below) |

### `/admin` subcommands

| Subcommand | Description |
|------------|-------------|
| `force-result <winner_psn>` | Force a match result from inside the match thread |
| `forfeit <forfeiting_psn>` | Forfeit a player — opponent advances |
| `order-replay` | Order a match replay |
| `override-match <match_id> <winner_psn>` | Manually set winner for disputed scores |
| `review-forfeit <match_id>` | Act on a forfeit appeal |
| `clear-flag <participant_id>` | Clear two-strike flag and reset forfeit_advances |
| `disqualify <participant_id>` | Remove a player from the bracket |
| `ban-cheater <discord_id> <psn_id>` | Add player to cheaters table |
| `player-history <participant_id>` | View a player's match history |
| `reset` | Reset the entire tournament (wipes bracket data) |

All admin commands require the `COUCH_CUP_ADMIN_ROLE` (or `DEV_ADMIN_ROLE` in dev).

---

## File Structure

```
src/
├── index.js                    # Bot entry — client setup, event listeners, scheduler start
├── config.js                   # Centralised env/config (dev/prod switching)
├── deploy-commands.js          # One-shot: registers slash commands with Discord API
│
├── commands/
│   ├── sync.js                 # /sync
│   ├── score.js                # /score + handleScoreModal
│   ├── bracket/
│   │   └── generate.js         # /bracket generate
│   └── round/
│       ├── open.js             # /round open
│       └── close.js            # /round close
│   └── admin/
│       └── force-result.js     # /admin (all subcommands)
│
├── handlers/
│   ├── match-flow.js           # handleButton + handleModal (all match interactions)
│   └── match-flow-exports.js   # Shared button builders (avoids circular imports)
│
└── lib/
    ├── supabase.js             # createClient + all DB query functions
    ├── scheduler.js            # 30s polling loop — enforces time windows
    ├── bracket.js              # Bracket generation helpers (roundName, seeding)
    ├── discord.js              # postAnnouncement, isAdmin helpers
    ├── round-manager.js        # checkRoundCompletion, advance logic
    └── time-parser.js          # dts() — formats timestamps for Discord
```

---

## Scheduler (`src/lib/scheduler.js`)

Runs every **30 seconds**. Checks all active matches and fires the appropriate action:

| Trigger | Action |
|---------|--------|
| Proposal made, no response after 30 min | Courtesy ping to opponent |
| Proposal cutoff passed (15 min before window end), no agreement | Proposer wins by forfeit |
| No proposal at all, match window expired | Both players disqualified (cascading replacement) |
| Agreed time reached | Posts score request in thread |
| Score window expired, no submission | Handler for score timeout |
| Dispute pending screenshots, deadline passed | Screenshot timeout handler |

---

## Match Flow (Button/Modal interactions)

Match threads are **public threads (type 11)** in `#match-scheduling`. No pinning (bot lacks permission).

Player interactions in thread:
1. **Propose time** → modal → stores `proposed_time_text/ts`, `proposal_expires_at`
2. **Agree** → sets `agreed_time_text/ts`, posts score request at agreed time
3. **Counter-propose** → new proposal, resets window
4. **Submit score** → `/score` modal → inserts into `score_reports`
   - Both match → winner resolved, thread closed
   - Mismatch → dispute flagged, screenshots requested
5. **Appeal** (on forfeit) → sends to admin review

---

## Screenshot Detection

`index.js` listens for `MessageCreate` in threads. If:
- Channel is a match thread
- Message has an image attachment
- Match is in `dispute_status = 'pending_screenshots'`

→ Saves `screenshot_url` to `score_reports`, reacts ✅.  
→ When both players upload: DMs the Tournament Director with a review prompt.

---

## Supabase Connection (`src/lib/supabase.js`)

Uses `@supabase/supabase-js` with the `service_role` key. No RLS. Default `public` schema.

```js
createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
})
```

See `SUPABASE.md` for full table reference.

---

## Deploying to Railway (when ready)

1. Push bot code to GitHub
2. Create new Railway service → connect repo → set root to `bot/`
3. Set all env vars from `.env` (production values)
4. Set `NODE_ENV=production` and `TEST_MODE=false`
5. Railway auto-deploys on push
