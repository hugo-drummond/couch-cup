-- Couch Cup Tournament Bot — Initial Schema
-- Run this in Supabase SQL editor or via CLI

CREATE SCHEMA IF NOT EXISTS couchcup;

-- ─────────────────────────────────────────
-- PARTICIPANTS
-- Populated by couchcup.co.za signups.
-- The bot reads this table; it does NOT write to it
-- except to update status on tournament events.
-- ─────────────────────────────────────────
CREATE TABLE couchcup.participants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text UNIQUE NOT NULL,
  psn_id            text UNIQUE NOT NULL,
  discord_id        text,                         -- nullable: not everyone links Discord
  mobile            text,
  date_of_birth     date,
  country           text,
  is_eligible       boolean NOT NULL DEFAULT true,
  signup_timestamp  timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'waitlist'
                    CHECK (status IN ('waitlist', 'bracket', 'eliminated', 'winner'))
);

CREATE INDEX idx_participants_status     ON couchcup.participants(status);
CREATE INDEX idx_participants_discord_id ON couchcup.participants(discord_id);
CREATE INDEX idx_participants_psn_id     ON couchcup.participants(psn_id);

-- ─────────────────────────────────────────
-- TOURNAMENTS
-- Single active tournament at a time (v1 scope).
-- ─────────────────────────────────────────
CREATE TABLE couchcup.tournaments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  game             text NOT NULL DEFAULT 'EA FC 26',
  max_participants integer NOT NULL DEFAULT 32,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'completed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  ended_at         timestamptz
);

-- ─────────────────────────────────────────
-- BRACKETS
-- One row per match.
-- position: 1-based slot within a round (1..16 for R1, 1..8 for R2, etc.)
-- The winner of position N in round R advances to ceil(N/2) in round R+1.
-- ─────────────────────────────────────────
CREATE TABLE couchcup.brackets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     uuid NOT NULL REFERENCES couchcup.tournaments(id) ON DELETE CASCADE,
  round_number      integer NOT NULL,             -- 1 = R1, 2 = R2, ... 5 = Final (32-player)
  position          integer NOT NULL,             -- 1-based slot within round
  participant_a_id  uuid REFERENCES couchcup.participants(id),
  participant_b_id  uuid REFERENCES couchcup.participants(id),
  winner_id         uuid REFERENCES couchcup.participants(id),

  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'completed', 'bye')),

  -- Scheduling
  scheduled_at      timestamptz,
  completed_at      timestamptz,

  -- Discord thread (created when round is opened)
  discord_thread_id text,

  -- Score submission (stored per-player; compared on second submission)
  score_a           integer,                      -- goals scored by participant_a
  score_b           integer,                      -- goals scored by participant_b
  reported_by_a     boolean NOT NULL DEFAULT false,
  reported_by_b     boolean NOT NULL DEFAULT false,

  -- Stream URLs (players submit via /score)
  stream_url_a      text,
  stream_url_b      text,

  -- Dispute / admin flags
  dispute_flag      boolean NOT NULL DEFAULT false,
  replay_ordered    boolean NOT NULL DEFAULT false,
  admin_override    boolean NOT NULL DEFAULT false,  -- true if result set by /admin force-result
  notes             text,                            -- admin free-text notes

  UNIQUE (tournament_id, round_number, position)
);

CREATE INDEX idx_brackets_tournament ON couchcup.brackets(tournament_id);
CREATE INDEX idx_brackets_round      ON couchcup.brackets(tournament_id, round_number);
CREATE INDEX idx_brackets_thread     ON couchcup.brackets(discord_thread_id);

-- ─────────────────────────────────────────
-- SCORE REPORTS
-- Raw per-player report before comparison.
-- Lets us audit who said what even after resolution.
-- ─────────────────────────────────────────
CREATE TABLE couchcup.score_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_id      uuid NOT NULL REFERENCES couchcup.brackets(id) ON DELETE CASCADE,
  reporter_id     uuid NOT NULL REFERENCES couchcup.participants(id),
  claimed_winner  uuid NOT NULL REFERENCES couchcup.participants(id),  -- who they say won
  score_reporter  integer NOT NULL,   -- reporter's own goal count
  score_opponent  integer NOT NULL,
  stream_url      text,
  screenshot_url  text,               -- stored in Supabase Storage if uploaded
  submitted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_score_reports_bracket ON couchcup.score_reports(bracket_id);

-- ─────────────────────────────────────────
-- HELPER: active tournament view
-- ─────────────────────────────────────────
CREATE OR REPLACE VIEW couchcup.active_tournament AS
  SELECT * FROM couchcup.tournaments
  WHERE status IN ('pending', 'active')
  ORDER BY created_at DESC
  LIMIT 1;
