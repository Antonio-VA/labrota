-- Punctions override per rota week (keyed by ISO date string)
ALTER TABLE public.rotas
  ADD COLUMN IF NOT EXISTS punctions_override jsonb;

-- Trainee + notes on individual assignments
ALTER TABLE public.rota_assignments
  ADD COLUMN IF NOT EXISTS trainee_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_rota_assignments_trainee
  ON public.rota_assignments(trainee_staff_id)
  WHERE trainee_staff_id IS NOT NULL;
