-- Add first_day_of_week setting to lab_config (0=Mon default, 6=Sun, 5=Sat)
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS first_day_of_week integer NOT NULL DEFAULT 0;
