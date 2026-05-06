-- ============================================================
-- NGen Connect — Supabase Schema (idempotent — safe to re-run)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. Companies table (replaces data/companies.json)
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id            TEXT PRIMARY KEY,
  company_name  TEXT NOT NULL,
  site          TEXT,
  homepage      TEXT,
  description   TEXT,
  sectors       TEXT,
  capabilities  TEXT,
  certifications TEXT,
  materials     TEXT,
  province      TEXT,
  company_size  TEXT,
  document      TEXT,
  embedding     vector(768)
);

-- IVFFlat index for fast approximate cosine search
-- (Run AFTER the migration script has loaded all rows)
-- CREATE INDEX IF NOT EXISTS companies_embedding_idx ON companies
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- 3. App settings (stores filter_options JSON)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ============================================================
-- 4. Profiles (auto-created on signup via trigger)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  full_name  TEXT,
  role       TEXT DEFAULT 'member',  -- 'member' | 'admin'
  plan       TEXT DEFAULT 'free',    -- 'free'   | 'unlimited'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "profiles: own read"
    ON profiles FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles: own update"
    ON profiles FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger: create profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 5. Conversations (search history + usage tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  query               TEXT NOT NULL,
  response            TEXT,
  companies_matched   JSONB,
  filters             JSONB,
  model_used          TEXT,
  input_tokens        INT DEFAULT 0,
  output_tokens       INT DEFAULT 0,
  embedding_tokens    INT DEFAULT 0,
  llm_cost_usd        NUMERIC(10,6) DEFAULT 0,
  embedding_cost_usd  NUMERIC(10,6) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "conversations: own read"
    ON conversations FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "conversations: own insert"
    ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 6. Vector search RPC function
-- ============================================================
CREATE OR REPLACE FUNCTION search_companies(
  query_embedding      vector(768),
  filter_sectors       TEXT[]  DEFAULT NULL,
  filter_capabilities  TEXT[]  DEFAULT NULL,
  filter_certifications TEXT[] DEFAULT NULL,
  filter_materials     TEXT[]  DEFAULT NULL,
  filter_province      TEXT    DEFAULT NULL,
  filter_company_size  TEXT    DEFAULT NULL,
  match_count          INT     DEFAULT 5
)
RETURNS TABLE (
  id            TEXT,
  company_name  TEXT,
  site          TEXT,
  homepage      TEXT,
  description   TEXT,
  sectors       TEXT,
  capabilities  TEXT,
  certifications TEXT,
  materials     TEXT,
  province      TEXT,
  company_size  TEXT,
  score         FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.company_name,
    c.site,
    c.homepage,
    c.description,
    c.sectors,
    c.capabilities,
    c.certifications,
    c.materials,
    c.province,
    c.company_size,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS score
  FROM companies c
  WHERE
    (
      filter_sectors IS NULL OR
      EXISTS (
        SELECT 1 FROM unnest(filter_sectors) s
        WHERE c.sectors ILIKE '%' || s || '%'
      )
    )
    AND (
      filter_capabilities IS NULL OR
      EXISTS (
        SELECT 1 FROM unnest(filter_capabilities) cap
        WHERE c.capabilities ILIKE '%' || cap || '%'
      )
    )
    AND (
      filter_certifications IS NULL OR
      EXISTS (
        SELECT 1 FROM unnest(filter_certifications) cert
        WHERE c.certifications ILIKE '%' || cert || '%'
      )
    )
    AND (
      filter_materials IS NULL OR
      EXISTS (
        SELECT 1 FROM unnest(filter_materials) mat
        WHERE c.materials ILIKE '%' || mat || '%'
      )
    )
    AND (filter_province IS NULL OR c.province = filter_province)
    AND (filter_company_size IS NULL OR c.company_size = filter_company_size)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
