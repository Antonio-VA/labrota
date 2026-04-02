-- Add separate toggle for whether public holidays reduce weekly staff budget
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS public_holiday_reduce_budget boolean NOT NULL DEFAULT true;
