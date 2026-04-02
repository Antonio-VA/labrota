-- Add default_days_per_week to lab_config
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS default_days_per_week integer NOT NULL DEFAULT 5;
