-- Add active flag to shift_types (defaults to true so existing shifts remain active)
ALTER TABLE public.shift_types ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
