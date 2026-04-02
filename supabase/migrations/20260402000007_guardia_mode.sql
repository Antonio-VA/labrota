-- ── Guardias alternas — weekend on-call mode ────────────────────────────────
-- Adds "guardia" as a valid days_off_preference value and guardia parameters
-- to lab_config. Adds prefers_guardia flag to staff.

-- 1. Expand the days_off_preference CHECK constraint to include 'guardia'
ALTER TABLE public.lab_config
  DROP CONSTRAINT IF EXISTS lab_config_days_off_preference_check;

ALTER TABLE public.lab_config
  ADD CONSTRAINT lab_config_days_off_preference_check
  CHECK (days_off_preference IN ('always_weekend', 'prefer_weekend', 'any_day', 'guardia'));

-- 2. Guardia distribution parameters on lab_config
--    guardia_min_weeks_between  : minimum full weeks between two guardia assignments
--                                  for the same person (default 2)
--    guardia_max_per_month      : hard cap on guardia shifts per person per calendar month
--                                  (default 2, 0 = no cap)
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS guardia_min_weeks_between integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS guardia_max_per_month     integer NOT NULL DEFAULT 2;

-- 3. Staff preference flag — staff who volunteer for / prefer guardia duty
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS prefers_guardia boolean NOT NULL DEFAULT false;
