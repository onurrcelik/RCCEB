-- RCCEB member & admin portal — full database schema (plain PostgreSQL 15+).
--
-- Run with `npm run db:setup` against the Aurora database in DATABASE_URL. Every
-- statement is idempotent (IF NOT EXISTS / OR REPLACE), so re-running is safe and is
-- how new tables get added to an existing database.
--
-- Security model: every table enables row level security with NO anon/authenticated
-- policies. The app reaches the database only from server code — through DATABASE_URL
-- (pg) or the service-role key — both of which bypass RLS. A broad policy is the main
-- way member data could leak, so keep it that way: add the table, enable RLS, stop.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Applications (from rcceb.org/join) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT,
  last_name TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  linkedin TEXT,
  graduation_year INT CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1950 AND 2100),
  -- young-entrepreneur | experienced-entrepreneur | executive | investor
  categories TEXT[] NOT NULL DEFAULT '{}',
  contact_consent BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_to_letter_of_intent BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT,                                   -- 'rcceb.org' or 'admin'
  status TEXT NOT NULL DEFAULT 'submitted',      -- submitted | sent to rc | rc verified
  admission_status TEXT NOT NULL DEFAULT '',     -- '' | accepted | deferred | declined
  notes TEXT NOT NULL DEFAULT '',
  member_id UUID,                                -- set when a portal invite is sent
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The join form's own id for the submission (its "User ID" sheet column). Lets the
-- website retry, or a sheet backfill re-run, without creating a second row.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS external_id TEXT;
-- City/country the applicant typed on rcceb.org/join (added Oct 2026). Copied onto the
-- member at invite time and pre-fills onboarding.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS location TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS applications_external_id_idx
  ON applications (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS applications_email_idx ON applications (lower(email));
CREATE INDEX IF NOT EXISTS applications_created_idx ON applications (created_at DESC);
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- ── Members ───────────────────────────────────────────────────────────────────
-- Join (rcceb.org/join) already supplies name, phone, LinkedIn, class year and
-- pathway (`categories`). Onboarding asks for the rest:
--   bio            → Bio
--   can_help_with  → What I can help with
--   working_on     → What I'm working on
--   expertise      → expertise tags
--   education      → Education after RC
--   favorite_resource → Favorite read / video / person / source
--   website        → Refer-a-Friend suggestions (JSON)
-- Older columns kept so existing rows still load: instagram, twitter,
-- member_types, occupation_link.
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  bio TEXT,
  avatar_url TEXT,
  member_types TEXT,
  linkedin TEXT,
  location TEXT,
  instagram TEXT,
  twitter TEXT,
  website TEXT,
  github TEXT,
  favorite_resource TEXT,
  occupation_link TEXT,
  phone TEXT,
  graduation_year INT CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1950 AND 2100),
  categories TEXT[] NOT NULL DEFAULT '{}',
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  -- Admin flag: keeps the profile (shown as "Past" in the directory) but revokes portal access.
  is_past_member BOOLEAN NOT NULL DEFAULT FALSE,
  deletion_requested_at TIMESTAMPTZ,
  pending_email TEXT,
  pending_email_code_hash TEXT,
  pending_email_expires_at TIMESTAMPTZ,
  pending_email_attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE applications
    ADD CONSTRAINT applications_member_fk FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Onboarding invites: the email carries our own token; only its hash is stored.
CREATE TABLE IF NOT EXISTS member_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  last_redeemed_at TIMESTAMPTZ,
  redeem_count INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS member_invites_member_open_idx ON member_invites (member_id, revoked_at, created_at DESC);
ALTER TABLE member_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS member_companies (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL CHECK (char_length(trim(company_name)) > 0 AND char_length(company_name) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE member_companies ENABLE ROW LEVEL SECURITY;

ALTER TABLE members ADD COLUMN IF NOT EXISTS can_help_with TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS working_on TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS expertise TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE members ADD COLUMN IF NOT EXISTS education TEXT;

-- One row per company. Members who type the same name share the row, so the
-- Companies directory can show every member who can open a door there.
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
  name_key TEXT NOT NULL UNIQUE,
  website TEXT,
  linkedin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS company_affiliations (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, member_id)
);
CREATE INDEX IF NOT EXISTS company_affiliations_member_idx ON company_affiliations (member_id);
ALTER TABLE company_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_affiliations ADD COLUMN IF NOT EXISTS role TEXT;

-- Carry older one-company rows into the directory. Safe to re-run.
INSERT INTO companies (name, name_key)
SELECT DISTINCT btrim(company_name), lower(regexp_replace(btrim(company_name), '\s+', ' ', 'g'))
FROM member_companies
WHERE btrim(company_name) <> ''
ON CONFLICT (name_key) DO NOTHING;

INSERT INTO company_affiliations (company_id, member_id)
SELECT c.id, mc.member_id
FROM member_companies mc
JOIN companies c ON c.name_key = lower(regexp_replace(btrim(mc.company_name), '\s+', ' ', 'g'))
ON CONFLICT DO NOTHING;

UPDATE members SET education = instagram
WHERE education IS NULL AND instagram IS NOT NULL AND btrim(instagram) <> '';

-- ── Sign-in (see app/lib/auth.ts) ─────────────────────────────────────────────
-- One row per sign-in request: hashes of the emailed link token and 6-digit code.
CREATE TABLE IF NOT EXISTS auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('member', 'admin')),
  link_token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_codes_email_idx ON auth_codes (email, kind, created_at DESC);
ALTER TABLE auth_codes ENABLE ROW LEVEL SECURITY;

-- Signed-in browsers: the cookie holds a random token, this table its hash.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('member', 'admin')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_sessions_email_idx ON auth_sessions (email);
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- ── Admin dashboard config (settings, shared notes, nav prefs, chat analysis) ──
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

-- ── Events ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  location TEXT,
  type TEXT DEFAULT 'In-person',                 -- 'In-person' | 'Online'
  attendees INT DEFAULT 0,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  upcoming BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- The event's own page (Luma, Eventbrite…): members see a Register / Event page button.
ALTER TABLE events ADD COLUMN IF NOT EXISTS link TEXT;

-- ── Links (curated by admins, shown on the member Links tab) ──────────────────
CREATE TABLE IF NOT EXISTS manual_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'article',
  notes TEXT,
  added_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE manual_links ENABLE ROW LEVEL SECURITY;

-- ── Perks ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS perk_interests (
  perk_id TEXT NOT NULL,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (perk_id, member_id)
);
CREATE INDEX IF NOT EXISTS perk_interests_perk_idx ON perk_interests (perk_id, created_at DESC);
ALTER TABLE perk_interests ENABLE ROW LEVEL SECURITY;

-- ── Job Board ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('job', 'need')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 140),
  description TEXT NOT NULL CHECK (char_length(trim(description)) > 0 AND char_length(description) <= 5000),
  location TEXT CHECK (location IS NULL OR char_length(location) <= 120),
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at TIMESTAMPTZ,
  share_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (type = 'job' OR location IS NULL),
  CHECK ((status = 'open' AND closed_at IS NULL) OR (status = 'closed' AND closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS job_board_posts_visible_idx ON job_board_posts (status, closed_at, type, title);
CREATE INDEX IF NOT EXISTS job_board_posts_author_idx ON job_board_posts (author_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS job_board_posts_share_token_idx ON job_board_posts (share_token);
ALTER TABLE job_board_posts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS job_board_subscriptions (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  notify_jobs BOOLEAN NOT NULL DEFAULT FALSE,
  notify_needs BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE job_board_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS job_board_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES job_board_posts(id) ON DELETE CASCADE,
  applicant_member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  external_name TEXT CHECK (external_name IS NULL OR char_length(external_name) <= 120),
  external_email TEXT CHECK (external_email IS NULL OR char_length(external_email) <= 200),
  pitch TEXT NOT NULL CHECK (char_length(trim(pitch)) > 0 AND char_length(pitch) <= 1500),
  link TEXT CHECK (link IS NULL OR char_length(link) <= 500),
  referred_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  referrer_name TEXT CHECK (referrer_name IS NULL OR char_length(referrer_name) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Either a member applicant OR an external applicant, never both.
  CHECK (
    (applicant_member_id IS NOT NULL AND external_name IS NULL AND external_email IS NULL)
    OR (applicant_member_id IS NULL
        AND char_length(trim(coalesce(external_name, ''))) > 0
        AND char_length(trim(coalesce(external_email, ''))) > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS job_board_applications_member_unique_idx
  ON job_board_applications (post_id, applicant_member_id) WHERE applicant_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_board_applications_post_idx ON job_board_applications (post_id, created_at DESC);
ALTER TABLE job_board_applications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS job_board_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES job_board_posts(id) ON DELETE CASCADE,
  referrer_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  referred_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (referrer_member_id <> referred_member_id),
  UNIQUE (post_id, referred_member_id)
);
CREATE INDEX IF NOT EXISTS job_board_referrals_referred_idx ON job_board_referrals (referred_member_id, status);
ALTER TABLE job_board_referrals ENABLE ROW LEVEL SECURITY;

-- ── Asks & Offers (marketplace_listings) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 140),
  description TEXT NOT NULL CHECK (char_length(trim(description)) > 0 AND char_length(description) <= 3000),
  contact_info TEXT NOT NULL CHECK (char_length(trim(contact_info)) > 0 AND char_length(contact_info) <= 300),
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS marketplace_listings_created_idx ON marketplace_listings (created_at DESC);
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
-- Shown in the portal as "Asks & Offers": an ask is something a member needs, an offer
-- is something they can help with.
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'offer'
  CHECK (type IN ('ask', 'offer'));

CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  notify_asks BOOLEAN NOT NULL DEFAULT FALSE,
  notify_offers BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE marketplace_subscriptions ENABLE ROW LEVEL SECURITY;

-- ── Monthly 1-on-1 matching ───────────────────────────────────────────────────
-- Members who chose "join every month": each new round puts them in straight away, and
-- they skip the monthly invitation. They can still sit out a single month.
ALTER TABLE members ADD COLUMN IF NOT EXISTS match_auto_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
-- The Turkish WhatsApp group intro ChatGPT drafts during onboarding (the "Bonus" part of
-- the onboarding prompt). Admin-only: never in the directory or a member API response.
ALTER TABLE members ADD COLUMN IF NOT EXISTS whatsapp_intro TEXT;

CREATE TABLE IF NOT EXISTS match_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS match_rounds_created_idx ON match_rounds (created_at DESC);
ALTER TABLE match_rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS match_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES match_rounds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  opted_in BOOLEAN,
  confirmed_met BOOLEAN,
  met_rating SMALLINT CHECK (met_rating IS NULL OR met_rating BETWEEN 1 AND 5),
  feedback_note TEXT CHECK (feedback_note IS NULL OR char_length(feedback_note) <= 2000),
  not_met_reason TEXT CHECK (not_met_reason IS NULL OR not_met_reason IN ('no_contact', 'no_schedule', 'fell_through', 'no_time')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, member_id)
);
ALTER TABLE match_responses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES match_rounds(id) ON DELETE CASCADE,
  member1_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  member2_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- Which of the pair is asked to reach out first.
  opener_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  email_sent BOOLEAN DEFAULT FALSE,
  admin_note TEXT,
  admin_note_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (member1_id <> member2_id)
);
CREATE INDEX IF NOT EXISTS matches_round_idx ON matches (round_id);
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION matches_opener_in_pair() RETURNS trigger AS $$
BEGIN
    IF NEW.opener_member_id IS NOT NULL
       AND NEW.opener_member_id <> NEW.member1_id
       AND NEW.opener_member_id <> NEW.member2_id THEN
        RAISE EXCEPTION 'opener_member_id must be member1_id or member2_id (match %)', NEW.id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS matches_opener_in_pair ON matches;
CREATE TRIGGER matches_opener_in_pair
    BEFORE INSERT OR UPDATE OF member1_id, member2_id, opener_member_id ON matches
    FOR EACH ROW EXECUTE FUNCTION matches_opener_in_pair();

-- ── Attendance (meeting screenshots → OCR) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date DATE NOT NULL UNIQUE,
  screenshot_file_name TEXT,
  ocr_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE attendance_meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS member_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES attendance_meetings(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT FALSE,
  matched_text TEXT,
  match_score INT,
  match_strategy TEXT,
  manually_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (meeting_id, member_id)
);
CREATE INDEX IF NOT EXISTS member_attendance_member_idx ON member_attendance (member_id);
ALTER TABLE member_attendance ENABLE ROW LEVEL SECURITY;

-- ── Email opt-outs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  email TEXT PRIMARY KEY CHECK (email = lower(trim(email)) AND char_length(email) <= 200),
  source TEXT NOT NULL DEFAULT 'link',           -- one_click | link | admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- ── Pitch decks ───────────────────────────────────────────────────────────────
-- The PDF lives in its own table so listing decks never reads the file bytes.
CREATE TABLE IF NOT EXISTS pitch_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 140),
  company_name TEXT NOT NULL CHECK (char_length(trim(company_name)) > 0 AND char_length(company_name) <= 120),
  description TEXT NOT NULL CHECK (char_length(trim(description)) > 0 AND char_length(description) <= 1500),
  stage TEXT NOT NULL CHECK (stage IN ('idea', 'pre-seed', 'seed', 'growth')),
  file_name TEXT NOT NULL CHECK (char_length(file_name) > 0 AND char_length(file_name) <= 200),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 4194304),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pitch_decks_created_idx ON pitch_decks (created_at DESC);
CREATE INDEX IF NOT EXISTS pitch_decks_author_idx ON pitch_decks (author_id, created_at DESC);
ALTER TABLE pitch_decks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pitch_deck_files (
  deck_id UUID PRIMARY KEY REFERENCES pitch_decks(id) ON DELETE CASCADE,
  bytes BYTEA NOT NULL
);
ALTER TABLE pitch_deck_files ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pitch_deck_views (
  deck_id UUID NOT NULL REFERENCES pitch_decks(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (deck_id, member_id)
);
ALTER TABLE pitch_deck_views ENABLE ROW LEVEL SECURITY;

-- ── Rate limiting (shared across instances; see app/lib/request-security.ts) ──
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION rate_limit_hit(p_key TEXT, p_window_ms BIGINT)
RETURNS TABLE(count INT, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- Opportunistic cleanup of long-expired keys on ~1% of hits.
    IF random() < 0.01 THEN
        DELETE FROM rate_limits WHERE rate_limits.reset_at < v_now - INTERVAL '1 day';
    END IF;
    INSERT INTO rate_limits AS rl (key, count, reset_at)
    VALUES (p_key, 1, v_now + (p_window_ms || ' milliseconds')::INTERVAL)
    ON CONFLICT (key) DO UPDATE
    SET
        count = CASE WHEN rl.reset_at <= v_now THEN 1 ELSE rl.count + 1 END,
        reset_at = CASE WHEN rl.reset_at <= v_now THEN v_now + (p_window_ms || ' milliseconds')::INTERVAL ELSE rl.reset_at END
    RETURNING rl.count, rl.reset_at INTO count, reset_at;
    RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION rate_limit_hit(TEXT, BIGINT) FROM PUBLIC;
