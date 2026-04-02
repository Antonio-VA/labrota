-- ── Contract type + onboarding period ──────────────────────────────────────
-- Adds contract_type to staff (full_time / part_time / intern)
-- Adds onboarding_end_date to staff (null = no onboarding period)
-- Adds part_time_weight + intern_weight to lab_config (coverage fraction)

-- 1. Contract type enum + column
DO $$ BEGIN
  CREATE TYPE public.contract_type AS ENUM ('full_time', 'part_time', 'intern');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS contract_type public.contract_type NOT NULL DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS onboarding_end_date date NULL;

-- 2. Coverage weights on lab_config
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS part_time_weight numeric(3,2) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS intern_weight    numeric(3,2) NOT NULL DEFAULT 0.5;
