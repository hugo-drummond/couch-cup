# Couch Cup — Supabase Reference

## Project
- **Ref:** set via `NEXT_PUBLIC_SUPABASE_URL` — `https://<project-ref>.supabase.co`
- **Region:** eu-central-1
- **Schema:** public (all tables live here)

## Auth
Two different access paths, for historical reasons:

- **Website** — most routes call the Supabase **Management API** over REST via
  `SUPABASE_MANAGEMENT_TOKEN`, not the `supabase-js` client. The `sql()` helper in
  `site3/lib/supabase.ts` wraps this, so a bad token breaks every query at once.
- **Website (subset)** — the sponsors page, analytics routes, and screenshot upload use
  `supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`.
- **Discord bot** — `supabase-js` against PostgREST directly.

**RLS is enabled on all tables.** Note that the service key bypasses it regardless, so
that key is the real security boundary for the server-side paths.

## Keys

No key values live in this repository. See `.env.local.example` for the names, and
Supabase → Settings → API Keys for the values.

The project uses Supabase's current **publishable / secret** API keys. The older
JWT-based `anon` and `service_role` keys have been disabled on this project.

---

## Tables

### participants
Main signup table. One row per person who signs up via the website.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| name | text | — | required |
| email | text | — | required |
| psn_id | text | — | required |
| discord_id | text | null | optional |
| mobile | text | null | stored as full intl number e.g. +27821234567 |
| date_of_birth | date | null | |
| country | text | null | from form dropdown, IP geo-detected |
| is_eligible | boolean | true | |
| signup_timestamp | timestamptz | now() | auto-set on insert |
| status | text | 'waitlist' | values: waitlist / bracket / eliminated / winner / flagged |
| forfeit_advances | integer | 0 | times player advanced via opponent forfeit |
| flagged_for_review | boolean | false | |
| marketing_opt_in | boolean | false | from signup form checkbox |

---

### tournaments
One row per tournament season.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| name | text | — | required |
| game | text | 'EA FC 26' | |
| max_participants | integer | 32 | |
| status | text | 'pending' | values: pending / active / completed |
| created_at | timestamptz | now() | |
| started_at | timestamptz | null | set when tournament goes active |
| ended_at | timestamptz | null | set when tournament completes |

---

### active_tournament
Single-row table — mirrors the current active tournament for easy querying.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | FK → tournaments.id |
| name | text | |
| game | text | |
| max_participants | integer | |
| status | text | |
| created_at | timestamptz | |
| started_at | timestamptz | |
| ended_at | timestamptz | |

---

### brackets
One row per match. All rounds of all tournaments.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| tournament_id | uuid | — | FK → tournaments.id |
| round_number | integer | — | 1 = R1, 2 = R2, etc. |
| position | integer | — | position within round |
| participant_a_id | uuid | null | FK → participants.id |
| participant_b_id | uuid | null | FK → participants.id |
| winner_id | uuid | null | FK → participants.id |
| status | text | 'pending' | values: pending / active / completed |
| scheduled_at | timestamptz | null | |
| completed_at | timestamptz | null | |
| discord_thread_id | text | null | Discord thread for this match |
| score_a | integer | null | |
| score_b | integer | null | |
| reported_by_a | boolean | false | player A submitted score |
| reported_by_b | boolean | false | player B submitted score |
| stream_url_a | text | null | |
| stream_url_b | text | null | |
| dispute_flag | boolean | false | |
| replay_ordered | boolean | false | |
| admin_override | boolean | false | |
| notes | text | null | |
| forfeit_reason | text | null | |
| dispute_status | text | null | |
| courtesy_ping_sent | boolean | false | |
| reschedule_attempted_at | timestamptz | null | |
| proposed_time_text | text | null | human-readable proposed time |
| proposed_time_ts | timestamptz | null | |
| proposed_by_discord_id | text | null | |
| proposal_expires_at | timestamptz | null | |
| agreed_time_text | text | null | |
| agreed_time_ts | timestamptz | null | |
| score_requested_at | timestamptz | null | |
| score_due_at | timestamptz | null | |
| schedule_msg_id | text | null | Discord message ID for scheduling |

---

### score_reports
Each player submits their own score report. Two rows per match when both report.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| bracket_id | uuid | FK → brackets.id |
| reporter_id | uuid | FK → participants.id |
| claimed_winner | uuid | FK → participants.id |
| score_reporter | integer | goals scored by reporter |
| score_opponent | integer | goals scored by opponent |
| stream_url | text | null |
| screenshot_url | text | null |
| submitted_at | timestamptz | auto-set |

---

### cheaters
Banned players. Bot checks this before allowing match participation.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| discord_id | text | required |
| full_name | text | null |
| tournament_id | uuid | FK → tournaments.id |
| reason | text | null |
| banned_at | timestamptz | auto-set |

---

### admin_reviews
Flagged matches awaiting admin decision.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| match_id | uuid | FK → brackets.id |
| requested_by | text | discord_id of requester |
| reason | text | null |
| status | text | 'pending' → 'resolved' |
| resolution | text | null |
| requested_at | timestamptz | auto-set |
| resolved_at | timestamptz | null |
