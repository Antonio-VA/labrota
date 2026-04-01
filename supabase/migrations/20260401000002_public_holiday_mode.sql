-- Add public_holiday_mode to lab_config
-- "normal" = holidays keep weekday coverage, no budget reduction
-- "saturday_coverage" = weekday holidays use Saturday coverage, budget reduced by 1 per holiday
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS public_holiday_mode text NOT NULL DEFAULT 'normal';
