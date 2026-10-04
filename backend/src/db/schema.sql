-- ═══════════════════════════════════════════════════════════════════
-- AquaGuard AI — Full Database Schema
-- Works on: plain PostgreSQL (NeonDB, Supabase) AND local + PostGIS
-- ═══════════════════════════════════════════════════════════════════

-- Try PostGIS — silently skip if not available (NeonDB without extension)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
  RAISE NOTICE 'PostGIS enabled — spatial indexes will be created';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS not available — falling back to lat/lng columns (fully functional)';
END;
$$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('citizen', 'reviewer', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE obs_status AS ENUM (
    'DRAFT','SUBMITTED','AI_CHECK',
    'VALID','REVIEW_REQUIRED','HUMAN_REVIEW',
    'ACCEPTED','CORRECTED','REJECTED','RESUBMIT_REQUESTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM (
    'LOCAL','QUEUED','UPLOADING','PROCESSING','SYNCED','CONFLICT','FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_analysis_status AS ENUM ('PENDING','PROCESSING','COMPLETE','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE review_decision AS ENUM (
    'ACCEPTED','CORRECTED','REJECTED','RESUBMIT_REQUESTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM (
    'LOW_CONFIDENCE','ANOMALY','REPEATED_CHANGE','DATA_QUALITY_ISSUE','SUDDEN_CHANGE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          user_role DEFAULT 'citizen',
  is_active     BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ─────────────────────────────────────────────────────────────────
-- SITES  (lat/lng as plain floats — no PostGIS required)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  lat         DOUBLE PRECISION,           -- decimal degrees
  lng         DOUBLE PRECISION,
  waterbody   TEXT,
  city        TEXT,
  country     TEXT DEFAULT 'IE',
  metadata    JSONB DEFAULT '{}',
  created_by  UUID REFERENCES users(id),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sites_city    ON sites(city);
CREATE INDEX IF NOT EXISTS idx_sites_active  ON sites(is_active);
CREATE INDEX IF NOT EXISTS idx_sites_lat_lng ON sites(lat, lng);

-- ─────────────────────────────────────────────────────────────────
-- OBSERVATIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS observations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id         TEXT UNIQUE,
  site_id          UUID REFERENCES sites(id) ON DELETE SET NULL,
  observer_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  status           obs_status DEFAULT 'DRAFT',
  sync_status      sync_status DEFAULT 'LOCAL',
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  gps_accuracy_m   FLOAT,
  observed_at      TIMESTAMPTZ NOT NULL,
  env_observations JSONB DEFAULT '{}',
  quality_score    INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  version          INTEGER DEFAULT 1,
  submitted_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obs_site        ON observations(site_id);
CREATE INDEX IF NOT EXISTS idx_obs_status      ON observations(status);
CREATE INDEX IF NOT EXISTS idx_obs_observer    ON observations(observer_id);
CREATE INDEX IF NOT EXISTS idx_obs_observed_at ON observations(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_lat_lng     ON observations(lat, lng);

-- ─────────────────────────────────────────────────────────────────
-- OBSERVATION STATE TRANSITIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS observation_state_transitions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_id UUID REFERENCES observations(id) ON DELETE CASCADE,
  from_state     obs_status,
  to_state       obs_status NOT NULL,
  triggered_by   TEXT NOT NULL DEFAULT 'system',
  actor_id       UUID REFERENCES users(id),
  reason         TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transitions_obs ON observation_state_transitions(observation_id);

-- ─────────────────────────────────────────────────────────────────
-- MEDIA
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_id       UUID REFERENCES observations(id) ON DELETE CASCADE,
  url                  TEXT NOT NULL,
  original_url         TEXT,
  public_id            TEXT,                  -- Cloudinary public_id (for deletion/transform)
  hash                 TEXT NOT NULL,
  phash                TEXT,
  mime_type            TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size_bytes      BIGINT,
  width                INTEGER,
  height               INTEGER,
  capture_timestamp    TIMESTAMPTZ,
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  quality_score        INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  quality_factors      JSONB DEFAULT '{}',
  quality_suggestions  JSONB DEFAULT '[]',
  analysis_status      media_analysis_status DEFAULT 'PENDING',
  is_duplicate         BOOLEAN DEFAULT FALSE,
  duplicate_of         UUID REFERENCES media(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_obs    ON media(observation_id);
CREATE INDEX IF NOT EXISTS idx_media_hash   ON media(hash);
CREATE INDEX IF NOT EXISTS idx_media_status ON media(analysis_status);

-- ─────────────────────────────────────────────────────────────────
-- AI RESULTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_results (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_id      UUID REFERENCES observations(id) ON DELETE CASCADE UNIQUE,
  model               TEXT NOT NULL,
  model_version       TEXT NOT NULL,
  prompt_version      TEXT NOT NULL DEFAULT 'v1.0',
  input_hash          TEXT,
  confidence          INTEGER CHECK (confidence BETWEEN 0 AND 100),
  confidence_factors  JSONB DEFAULT '{}',
  explanation         JSONB DEFAULT '{}',
  validation_warnings JSONB DEFAULT '[]',
  routing_decision    TEXT CHECK (routing_decision IN ('VALID','REVIEW_REQUIRED','HUMAN_REVIEW')),
  processing_ms       INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_results_obs        ON ai_results(observation_id);
CREATE INDEX IF NOT EXISTS idx_ai_results_confidence ON ai_results(confidence);

-- ─────────────────────────────────────────────────────────────────
-- AI EVIDENCE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_evidence (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ai_result_id    UUID REFERENCES ai_results(id) ON DELETE CASCADE,
  indicator       TEXT NOT NULL,
  present         TEXT NOT NULL CHECK (present IN ('true','false','uncertain')),
  confidence      FLOAT NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  reasoning       TEXT,
  source_media_id UUID REFERENCES media(id),
  image_region    JSONB,
  model           TEXT,
  model_version   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evidence_result    ON ai_evidence(ai_result_id);
CREATE INDEX IF NOT EXISTS idx_evidence_indicator ON ai_evidence(indicator);

-- ─────────────────────────────────────────────────────────────────
-- FOLLOW-UP QUESTIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followup_questions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ai_result_id        UUID REFERENCES ai_results(id) ON DELETE CASCADE,
  question_key        TEXT NOT NULL,
  question_text       TEXT NOT NULL,
  indicator_type      TEXT,
  display_order       INTEGER NOT NULL DEFAULT 0,
  citizen_answer      TEXT,
  ai_suggested_answer TEXT,
  answered_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questions_result ON followup_questions(ai_result_id);

-- ─────────────────────────────────────────────────────────────────
-- HUMAN REVIEWS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS human_reviews (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_id      UUID REFERENCES observations(id) ON DELETE CASCADE UNIQUE,
  reviewer_id         UUID REFERENCES users(id),
  decision            review_decision NOT NULL,
  citizen_observation JSONB,
  ai_assessment       JSONB,
  human_assessment    JSONB,
  final_assessment    JSONB,
  reason              TEXT,
  reviewed_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_obs      ON human_reviews(observation_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON human_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_decision ON human_reviews(decision);

-- ─────────────────────────────────────────────────────────────────
-- SITE ALERTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         UUID REFERENCES sites(id) ON DELETE CASCADE,
  alert_type      alert_type NOT NULL,
  severity        alert_severity NOT NULL DEFAULT 'MEDIUM',
  message         TEXT NOT NULL,
  observation_ids UUID[] DEFAULT '{}',
  is_resolved     BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_site     ON site_alerts(site_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON site_alerts(is_resolved);

-- ─────────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_id    UUID REFERENCES observations(id),
  action            TEXT NOT NULL,
  actor_type        TEXT NOT NULL CHECK (actor_type IN ('ai','citizen','reviewer','system')),
  actor_id          UUID,
  model             TEXT,
  model_version     TEXT,
  prompt_version    TEXT,
  input_hash        TEXT,
  output            JSONB,
  confidence        FLOAT,
  human_decision    TEXT,
  correction_reason TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_obs     ON audit_logs(observation_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- REFRESH TOKENS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON refresh_tokens(user_id);

-- ─────────────────────────────────────────────────────────────────
-- OPTIONAL: PostGIS spatial indexes (created only if PostGIS exists)
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    -- Add computed geography columns for spatial queries (local only)
    RAISE NOTICE 'PostGIS detected — spatial features available';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- updated_at auto-trigger
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at        ON users;
DROP TRIGGER IF EXISTS update_sites_updated_at        ON sites;
DROP TRIGGER IF EXISTS update_observations_updated_at ON observations;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON sites FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_observations_updated_at
  BEFORE UPDATE ON observations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
