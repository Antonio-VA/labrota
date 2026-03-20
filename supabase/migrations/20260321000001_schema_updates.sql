-- ============================================================
-- Schema updates: shift times, days_per_week, OPU, egg_collection
-- Guards for previous migrations included (IF NOT EXISTS)
-- ============================================================

-- Ensure columns from 20260320000001_rota_features.sql exist
ALTER TABLE rota_assignments
  ADD COLUMN IF NOT EXISTS trainee_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE rotas
  ADD COLUMN IF NOT EXISTS punctions_override jsonb;

-- 1. days_per_week on staff (used by generator as max weekly shift budget)
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS days_per_week integer NOT NULL DEFAULT 5
    CHECK (days_per_week >= 1 AND days_per_week <= 7);

-- 2. OPU designation on rota assignments
ALTER TABLE rota_assignments
  ADD COLUMN IF NOT EXISTS is_opu boolean NOT NULL DEFAULT false;

-- 3. Shift start/end times in lab_config
ALTER TABLE lab_config
  ADD COLUMN IF NOT EXISTS shift_am_start   text NOT NULL DEFAULT '07:30',
  ADD COLUMN IF NOT EXISTS shift_am_end     text NOT NULL DEFAULT '14:30',
  ADD COLUMN IF NOT EXISTS shift_pm_start   text NOT NULL DEFAULT '14:30',
  ADD COLUMN IF NOT EXISTS shift_pm_end     text NOT NULL DEFAULT '21:30',
  ADD COLUMN IF NOT EXISTS shift_full_start text NOT NULL DEFAULT '07:30',
  ADD COLUMN IF NOT EXISTS shift_full_end   text NOT NULL DEFAULT '21:30';

-- 4. New skill: egg_collection (Recogida de óvulos)
ALTER TYPE skill_name ADD VALUE IF NOT EXISTS 'egg_collection';

-- 5. Update staffing_ratio default to match new semantics
--    (now means: punctions per embryologist, not staff per punction)
ALTER TABLE lab_config ALTER COLUMN staffing_ratio SET DEFAULT 3;
