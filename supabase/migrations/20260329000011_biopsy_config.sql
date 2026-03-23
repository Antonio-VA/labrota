-- Biopsy forecasting configuration
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_conversion_rate numeric NOT NULL DEFAULT 0.5;
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_day5_pct numeric NOT NULL DEFAULT 0.5;
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_day6_pct numeric NOT NULL DEFAULT 0.5;
