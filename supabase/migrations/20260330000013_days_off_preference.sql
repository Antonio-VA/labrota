-- Add days_off_preference to lab_config
-- "always_weekend" = days off must be Sat/Sun
-- "prefer_weekend" = prefer weekend days off (default)
-- "any_day" = no preference
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS days_off_preference text NOT NULL DEFAULT 'prefer_weekend'
  CHECK (days_off_preference IN ('always_weekend', 'prefer_weekend', 'any_day'));
