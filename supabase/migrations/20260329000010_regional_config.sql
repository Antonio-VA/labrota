-- Regional configuration fields
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT '';
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS time_format text NOT NULL DEFAULT '24h';
