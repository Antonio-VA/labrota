-- Fix: replace expression-based index with plain column constraint
-- so upsert / conflict handling works correctly

-- Drop the expression-based index
DROP INDEX IF EXISTS public.rota_assignments_rota_staff_date_fn_idx;

-- Normalize existing NULLs to empty string
UPDATE public.rota_assignments SET function_label = '' WHERE function_label IS NULL;

-- Set default to '' so future inserts never have NULL
ALTER TABLE public.rota_assignments ALTER COLUMN function_label SET DEFAULT '';
ALTER TABLE public.rota_assignments ALTER COLUMN function_label SET NOT NULL;

-- Plain unique constraint on actual columns — supports ON CONFLICT
ALTER TABLE public.rota_assignments
  ADD CONSTRAINT rota_assignments_rota_staff_date_fn_key
  UNIQUE (rota_id, staff_id, date, function_label);
