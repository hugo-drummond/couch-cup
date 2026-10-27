-- ══════════════════════════════════════════════════════════════
-- COUCH CUP — Initial Schema
-- Project: smjyhevejwsprlzqhnvn
-- Run in Supabase SQL Editor → paste and hit Run
-- ══════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS couchcup;

-- ──────────────────────────────────────────────────────────────
-- PARTICIPANTS
-- Populated by couchcup.co.za signups.
-- Bot reads this; only updates `status` field.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE couchcup.participants (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  email             text        UNIQUE NOT NULL,
  psn_id            text        UNIQUE NOT NULL,
  discord_id        text,                          -- nullable: fallback to email if missing
  mobile            text,
  date_of_birth     date,
  country           text,
  is_eligible       boolean     NOT NULL DEFAULT true,
  signup_timestamp  timestamptz NOT NULL DEFAULT now(),
  status            text        NOT NULL DEFAULT 'waitlist'
                    CHECK (status IN ('waitlist', 'bracket', 'eliminated', 'winner'))
);

CREATE INDEX idx_participants_status     ON couchcup.participants(status);
CREATE INDEX idx_participants_discord_id ON couchcup.participants(discord_id);
CREATE INDEX idx_participants_psn_id     ON couchcup.participants(psn_id);

-- ──────────────────────────────────────────────────────────────
-- TOURNAMENTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE couchcup.tournaments (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text    NOT NULL,
  game             text    NOT NULL DEFAULT 'EA FC 26',
  max_participants integer NOT NULL DEFAULT 32,
  status           text    NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'completed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  ended_at         timestamptz
);

-- ──────────────────────────────────────────────────────────────
-- BRACKETS
-- One row per match.
-- position: 1-based slot within a round.
-- Winner of position N in round R → position ceil(N/2) in round R+1.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE couchcup.brackets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     uuid NOT NULL REFERENCES couchcup.tournaments(id) ON DELETE CASCADE,
  round_number      integer NOT NULL,   -- 1=R1 … 5=Final (32-player = 5 rounds)
  position          integer NOT NULL,   -- 1-based slot within round

  participant_a_id  uuid REFERENCES couchcup.participants(id),
  participant_b_id  uuid REFERENCES couchcup.participants(id),
  winner_id         uuid REFERENCES couchcup.participants(id),

  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'completed', 'bye')),

  -- Scheduling
  scheduled_at      timestamptz,
  completed_at      timestamptz,

  -- Discord thread created by /round open
  discord_thread_id text,

  -- Scores (set on second matching report, or by admin)
  score_a           integer,            -- goals for participant_a
  score_b           integer,            -- goals for participant_b
  reported_by_a     boolean NOT NULL DEFAULT false,
  reported_by_b     boolean NOT NULL DEFAULT false,

  -- Stream URLs submitted via /score
  stream_url_a      text,
  stream_url_b      text,

  -- Admin / dispute flags
  dispute_flag      boolean NOT NULL DEFAULT false,
  replay_ordered    boolean NOT NULL DEFAULT false,
  admin_override    boolean NOT NULL DEFAULT false,
  notes             text,

  UNIQUE (tournament_id, round_number, position)
);

CREATE INDEX idx_brackets_tournament ON couchcup.brackets(tournament_id);
CREATE INDEX idx_brackets_round      ON couchcup.brackets(tournament_id, round_number);
CREATE INDEX idx_brackets_thread     ON couchcup.brackets(discord_thread_id);

-- ──────────────────────────────────────────────────────────────
-- SCORE REPORTS
-- Immutable audit log of every /score submission.
-- Raw per-player report before comparison/resolution.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE couchcup.score_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_id      uuid NOT NULL REFERENCES couchcup.brackets(id) ON DELETE CASCADE,
  reporter_id     uuid NOT NULL REFERENCES couchcup.participants(id),
  claimed_winner  uuid NOT NULL REFERENCES couchcup.participants(id),
  score_reporter  integer NOT NULL,
  score_opponent  integer NOT NULL,
  stream_url      text,
  screenshot_url  text,               -- Supabase Storage path if uploaded
  submitted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_score_reports_bracket ON couchcup.score_reports(bracket_id);

-- ──────────────────────────────────────────────────────────────
-- VIEWS
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW couchcup.active_tournament AS
  SELECT * FROM couchcup.tournaments
  WHERE status IN ('pending', 'active')
  ORDER BY created_at DESC
  LIMIT 1;
