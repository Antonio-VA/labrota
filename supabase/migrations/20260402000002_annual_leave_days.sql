-- Annual leave days per employee (used for optimal headcount calculation)
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS annual_leave_days integer NOT NULL DEFAULT 20;
