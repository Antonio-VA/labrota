-- Add department_codes to shift_types for by_task orgs
-- Links shifts to departments: which departments participate in each shift

ALTER TABLE public.shift_types
  ADD COLUMN IF NOT EXISTS department_codes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.shift_types.department_codes
  IS 'Array of department codes that participate in this shift (by_task mode)';
