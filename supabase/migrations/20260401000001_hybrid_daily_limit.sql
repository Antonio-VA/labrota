-- Add per-org daily hybrid generation limit (default 10)
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS daily_hybrid_limit int NOT NULL DEFAULT 10;

-- Track each hybrid generation invocation for quota enforcement
CREATE TABLE IF NOT EXISTS public.hybrid_generation_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hybrid_generation_log_org_date
  ON public.hybrid_generation_log (organisation_id, created_at);

ALTER TABLE public.hybrid_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view own hybrid log"
  ON public.hybrid_generation_log FOR SELECT
  USING (organisation_id = auth_organisation_id());

CREATE POLICY "org members can insert own hybrid log"
  ON public.hybrid_generation_log FOR INSERT
  WITH CHECK (organisation_id = auth_organisation_id());
