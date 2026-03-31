-- ============================================================
-- Lume: AI Evolution Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add reconciliation fields to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_reconciled   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ai_confidence   FLOAT   DEFAULT NULL;

-- Existing transactions (manual/already confirmed) are reconciled by default
UPDATE transactions SET is_reconciled = TRUE WHERE is_reconciled IS NULL;

-- Mark all existing import transactions as already reconciled 
-- (they were committed directly before this migration)
UPDATE transactions SET is_reconciled = TRUE WHERE origin = 'import';

-- Index for the pending-review query (frequent access pattern)
CREATE INDEX IF NOT EXISTS idx_transactions_pending_review
  ON transactions(user_id, is_reconciled, origin)
  WHERE is_reconciled = FALSE AND origin = 'import';

-- ============================================================
-- 2. Add AI cache control fields to profiles
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS needs_insight_recalc BOOLEAN   DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_insight_at       TIMESTAMPTZ DEFAULT NULL;

-- ============================================================
-- 3. Create AI insights cache table
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_insights_cache (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payload     TEXT        NOT NULL,          -- JSON string from LLM
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep only last 5 per user (older ones are historical)
CREATE INDEX IF NOT EXISTS idx_ai_insights_cache_user
  ON ai_insights_cache(user_id, created_at DESC);

-- Row Level Security
ALTER TABLE ai_insights_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own insight cache" ON ai_insights_cache;
CREATE POLICY "Users see own insight cache"
  ON ai_insights_cache FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- 4. Ensure ai_rules has unique constraint on user_id + keyword
--    (needed for the UPSERT in reconcile endpoint)
-- ============================================================
ALTER TABLE ai_rules
  DROP CONSTRAINT IF EXISTS ai_rules_user_keyword_unique;

ALTER TABLE ai_rules
  ADD CONSTRAINT ai_rules_user_keyword_unique UNIQUE (user_id, keyword);
