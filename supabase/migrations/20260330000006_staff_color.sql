-- Add personal color to staff for hover highlighting in task grid
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';
