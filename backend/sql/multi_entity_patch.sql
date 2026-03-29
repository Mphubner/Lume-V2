-- =============================================================
-- Patch: Add multi-entity support (family + business)
-- Execute this in the Supabase SQL Editor
-- =============================================================

-- 1. Add 'type' column to families table (family or business)
ALTER TABLE families ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'family';

-- 2. Add 'import_id' to transactions (for audit trail)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_id UUID;

-- 3. Ensure existing families are labeled correctly
UPDATE families SET type = 'family' WHERE type IS NULL;

-- 4. Create index for faster entity queries
CREATE INDEX IF NOT EXISTS idx_families_type ON families(type);
CREATE INDEX IF NOT EXISTS idx_families_owner_type ON families(owner_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_import_id ON transactions(import_id);

-- 5. Fix existing invited members who are stuck in onboarding
-- This updates any user who is in family_members but whose profile
-- hasn't been marked as onboarding complete or granted
UPDATE profiles
SET onboarding_completed = true,
    plan_status = 'granted',
    plan = COALESCE(plan, 'family')
WHERE id IN (
  SELECT fm.user_id FROM family_members fm
  WHERE fm.role != 'owner'
)
AND (onboarding_completed IS NULL OR onboarding_completed = false);
