-- Shift rotation mode: stable (default), weekly, daily
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS shift_rotation text NOT NULL DEFAULT 'stable';
