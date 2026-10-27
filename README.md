# Couch Cup

**South Africa's free online gaming tournament — run almost entirely by software.**

Players sign up, get drawn into a bracket, and are then handed to an automated system that pairs them with an opponent, negotiates a match time out of both players' availability, opens a scoring window, resolves the result, and advances the bracket — sending the right email at each step. A tournament runs to completion with very little human involvement.

Season 1 (EA FC, 1v1) completed in July 2026. Season 2 — Fortnite Duos, R500 per player, free entry — is open for registration and runs 28 August 2026.

**Live:** [couchcup.co.za](https://www.couchcup.co.za) · Designed, built and operated solo — product, engine, email, infrastructure and the tournaments themselves.

---

## Why this is interesting

The signup form is the boring part. The interesting part is everything that happens after the bracket is drawn.

Running a knockout tournament for people scattered across a country, none of whom are in the same room and all of whom have jobs, turns out to be mostly a **scheduling and deadline problem**. Two strangers have to agree a time, both have to show up, both have to report a result — and if either fails at any of that, the tournament still has to advance on schedule.

So the system is built around deadlines that always resolve, rather than around the happy path:

- **Availability negotiation** — both players submit time windows. If they overlap, the match schedules itself. If they don't, the system proposes the closest workable slot and asks both to confirm. If someone declines, it schedules inside the more-available player's window.
- **Every window has an expiry, and every expiry has a defined outcome.** Miss the scheduling deadline and your opponent advances by walkover. Both miss it and the best-performing loser from the previous round is promoted into the slot instead. Miss the scoring deadline and whoever *did* report wins. Nobody reports and, again, a loser is promoted. The bracket never stalls waiting for a human.
- **Disagreements are handled explicitly** — both players reporting the same draw triggers an automatic rematch with fresh tokens; both claiming victory flags an admin review rather than guessing.
- **A single 15-minute heartbeat** drives all of it, holding a database lock so overlapping runs can't double-process a match.

The email system exists to serve that engine: 33 distinct transactional emails, each carrying single-use expiring tokens so a player can act straight from their inbox. There are no player accounts and no passwords anywhere in the system.

---

## Stack

**Web** — Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
**Database** — Supabase (Postgres)
**Scheduling** — `pg_cron` + `pg_net` inside Postgres, calling back into the app over HTTP
**Email** — AWS SES, with Resend as fallback
**Hosting** — Vercel
**Bot** — Node.js, discord.js v14

---

## Repository layout

| Directory | Status | What it is |
|---|---|---|
| `site3/` | **live** | The current application — couchcup.co.za. Everything below refers to this. |
| `bot/` | dormant | Discord bot for in-server tournament commands |

Inside `site3/`:

```
app/
  api/tournament/       The engine — advance, score, availability, proposal, forfeit
  availability/ proposal/ respond/ match/ forfeit/    Token-gated player flows
  players/ couchcupdashboard/ blog-admin/             Admin surfaces
lib/
  tournament-advance.ts  The heartbeat — every deadline check lives here
  bracket.ts             Bracket construction and projection
  email.ts               33 transactional email templates
  tokens.ts              Single-use expiring token generation
```

~13,700 lines of application TypeScript. This public repo is a cleaned snapshot; day-to-day development (460+ commits, earlier front-end iterations) lives in a private repo.

For the engine, the scheduling state machine, and the data model, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Running locally

Requires Node 20+.

```bash
git clone https://github.com/hugo-drummond/couch-cup.git
cd couch-cup/site3
npm install
cp .env.local.example .env.local
```

Minimum to boot:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_MANAGEMENT_TOKEN` | Management API token — **most queries run through this** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key, used by the sponsors, analytics and upload paths |
| `DASHBOARD_KEY` | Admin access key. Unset means admin pages deny everything — they fail closed by design. |

Email (`AWS_*`, `RESEND_API_KEY`), Discord, Meta and Turnstile keys each gate one feature and can stay empty in development.

```bash
npm run dev        # http://localhost:3004
npm run typecheck  # also runs in CI on every push
```

If the bracket renders empty, check `SUPABASE_MANAGEMENT_TOKEN` first. A malformed value makes every query throw, and the routes catch and return empty rather than erroring — so the failure is completely silent. A trailing newline inside the value is enough to do it.

---

## Status

Season 1 finished 7 July 2026. Season 2 registration has been open since 11 July 2026.

The `tournament-advance` pg_cron job is **currently disabled** between seasons and must be re-enabled before Season 2 matches begin — with it off, nothing advances. A known zero-width-window bug in `release-round-alerts.ts` is still outstanding.

---

## A note on the schema

Season 1 used a `participants` table; Season 2 added `players` + `waitlist_entries` to support multiple seasons. Both exist, and some paths still read the older table. The `psn_id` → `gaming_id` rename that came with going multi-game is likewise only partly done.

Left deliberately as-is rather than half-migrated in a way that could break a live tournament mid-season.
