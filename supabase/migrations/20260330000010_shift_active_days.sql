-- Active days per shift (array of day codes, default all 7)
ALTER TABLE public.shift_types ADD COLUMN IF NOT EXISTS active_days text[] NOT NULL DEFAULT '{mon,tue,wed,thu,fri,sat,sun}';
