-- Allow same staff on same day with different function_label (by_task mode)
-- Drop old unique constraint (rota_id, staff_id, date)
ALTER TABLE public.rota_assignments
  DROP CONSTRAINT IF EXISTS rota_assignments_rota_id_staff_id_date_key;

-- Add new unique constraint that includes function_label (coalesce null → '' for uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS rota_assignments_rota_staff_date_fn_idx
  ON public.rota_assignments (rota_id, staff_id, date, COALESCE(function_label, ''));
