-- Track completion timestamps for implementation steps
CREATE TABLE IF NOT EXISTS public.implementation_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES auth.users(id),
  UNIQUE(organisation_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_impl_steps_org ON public.implementation_steps(organisation_id);

ALTER TABLE public.implementation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org steps" ON public.implementation_steps
  FOR SELECT USING (organisation_id = auth_organisation_id());

COMMENT ON TABLE public.implementation_steps IS 'Tracks when each implementation step was first completed and by whom';
