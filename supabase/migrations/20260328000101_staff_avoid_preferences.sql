-- Add avoid_days and avoid_shifts columns to staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS avoid_days text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avoid_shifts text[] DEFAULT '{}';

COMMENT ON COLUMN public.staff.avoid_days IS 'Days the staff member prefers NOT to work (soft constraint)';
COMMENT ON COLUMN public.staff.avoid_shifts IS 'Shift codes the staff member prefers NOT to work (soft constraint)';
