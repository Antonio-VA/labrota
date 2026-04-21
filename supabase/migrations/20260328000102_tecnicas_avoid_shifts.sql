-- Add avoid_shifts column to tecnicas table
ALTER TABLE public.tecnicas
  ADD COLUMN IF NOT EXISTS avoid_shifts text[] DEFAULT '{}';

COMMENT ON COLUMN public.tecnicas.avoid_shifts IS 'Shift codes this technique should NOT be scheduled in (soft constraint for warnings)';
