-- ============================================================
-- NGen Connect — Supabase Schema v2 (idempotent — safe to re-run)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. Drop old companies table + search function (v1 used vector(768))
-- ============================================================
DROP FUNCTION IF EXISTS search_companies CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- ============================================================
-- 3. Companies table — 5,128 Canadian suppliers
-- ============================================================
CREATE TABLE companies (
  id                    TEXT PRIMARY KEY,          -- canonical domain (site)
  site                  TEXT,
  homepage              TEXT,

  -- Identity
  company_name          TEXT NOT NULL,
  city                  TEXT,
  province              TEXT,
  tagline               TEXT,
  summary               TEXT,                      -- 5-8 sentence BI profile
  founded_year          INT,
  headcount_range       TEXT,                      -- '1-10' | '11-50' | '51-200' | '201-500' | '500+'
  company_type          TEXT,                      -- 'manufacturer' | 'distributor' | 'technology' | etc.
  business_model        TEXT,                      -- 'contract_manufacturing' | 'saas' | 'distribution' | etc.
  funding_stage         TEXT,                      -- 'bootstrapped' | 'seed' | 'series_a' | etc.
  languages             TEXT[],
  health_canada_registered BOOLEAN DEFAULT FALSE,

  -- Capabilities (arrays — filterable)
  capabilities          TEXT[],
  capabilities_enhanced TEXT[],
  specializations       TEXT[],
  products              TEXT[],
  technology            TEXT[],
  equipment             TEXT[],
  materials             TEXT[],
  capacity              TEXT,

  -- Markets
  industries_served     TEXT[],
  key_customers         TEXT[],

  -- Compliance
  certifications        TEXT[],
  certifications_not_found TEXT[],
  export_compliance     TEXT[],

  -- Search
  embed_text            TEXT,
  embedding             vector(1536),

  -- Metadata
  pages_used            INT,
  extraction_mode       TEXT,
  extracted_at          TIMESTAMPTZ,
  enhanced_at           TIMESTAMPTZ,
  merged_from           TEXT[]
);

-- ============================================================
-- 4. HNSW index for fast cosine similarity search
--    (Run AFTER loader script inserts all rows)
-- ============================================================
-- CREATE INDEX companies_embedding_hnsw ON companies
--   USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);

-- ============================================================
-- 5. GIN indexes for array field filtering
-- ============================================================
CREATE INDEX IF NOT EXISTS companies_certifications_gin   ON companies USING GIN (certifications);
CREATE INDEX IF NOT EXISTS companies_capabilities_gin     ON companies USING GIN (capabilities_enhanced);
CREATE INDEX IF NOT EXISTS companies_industries_gin       ON companies USING GIN (industries_served);
CREATE INDEX IF NOT EXISTS companies_materials_gin        ON companies USING GIN (materials);
CREATE INDEX IF NOT EXISTS companies_province_idx         ON companies (province);
CREATE INDEX IF NOT EXISTS companies_company_type_idx     ON companies (company_type);
CREATE INDEX IF NOT EXISTS companies_business_model_idx   ON companies (business_model);

-- ============================================================
-- 6. Vector search RPC — embed query → top N matches
-- ============================================================
CREATE OR REPLACE FUNCTION search_companies(
  query_embedding       vector(1536),
  filter_province       TEXT      DEFAULT NULL,
  filter_company_type   TEXT      DEFAULT NULL,
  filter_business_model TEXT      DEFAULT NULL,
  filter_certifications TEXT[]    DEFAULT NULL,
  filter_industries     TEXT[]    DEFAULT NULL,
  filter_materials      TEXT[]    DEFAULT NULL,
  match_count           INT       DEFAULT 20
)
RETURNS TABLE (
  id                    TEXT,
  company_name          TEXT,
  site                  TEXT,
  homepage              TEXT,
  city                  TEXT,
  province              TEXT,
  tagline               TEXT,
  summary               TEXT,
  company_type          TEXT,
  business_model        TEXT,
  headcount_range       TEXT,
  founded_year          INT,
  capabilities          TEXT[],
  capabilities_enhanced TEXT[],
  products              TEXT[],
  technology            TEXT[],
  equipment             TEXT[],
  materials             TEXT[],
  certifications        TEXT[],
  certifications_not_found TEXT[],
  industries_served     TEXT[],
  key_customers         TEXT[],
  export_compliance     TEXT[],
  capacity              TEXT,
  score                 FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.company_name,
    c.site,
    c.homepage,
    c.city,
    c.province,
    c.tagline,
    c.summary,
    c.company_type,
    c.business_model,
    c.headcount_range,
    c.founded_year,
    c.capabilities,
    c.capabilities_enhanced,
    c.products,
    c.technology,
    c.equipment,
    c.materials,
    c.certifications,
    c.certifications_not_found,
    c.industries_served,
    c.key_customers,
    c.export_compliance,
    c.capacity,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS score
  FROM companies c
  WHERE
    (filter_province       IS NULL OR c.province      = filter_province)
    AND (filter_company_type   IS NULL OR c.company_type  = filter_company_type)
    AND (filter_business_model IS NULL OR c.business_model = filter_business_model)
    AND (filter_certifications IS NULL OR c.certifications @> filter_certifications)
    AND (filter_industries     IS NULL OR c.industries_served @> filter_industries)
    AND (filter_materials      IS NULL OR c.materials @> filter_materials)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 7. App settings (stores filter_options JSON — unchanged)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ============================================================
-- 8. Profiles (auto-created on signup via trigger — unchanged)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  full_name  TEXT,
  role       TEXT DEFAULT 'member',
  plan       TEXT DEFAULT 'free',
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

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 9. Conversations (search history — unchanged)
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
