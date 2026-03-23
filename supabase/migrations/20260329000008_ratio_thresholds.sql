-- Add ratio threshold fields to lab_config
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS ratio_optimal numeric NOT NULL DEFAULT 1.0;
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS ratio_minimum numeric NOT NULL DEFAULT 0.75;
