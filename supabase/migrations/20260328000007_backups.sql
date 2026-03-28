-- Lab config backup system
CREATE TABLE IF NOT EXISTS public.backups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('auto', 'manual')),
  label text,
  config jsonb NOT NULL DEFAULT '{}',
  rotas jsonb NOT NULL DEFAULT '[]',
  CONSTRAINT backups_label_manual CHECK (type = 'auto' OR label IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_backups_org_date ON public.backups(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_type ON public.backups(organisation_id, type);

COMMENT ON TABLE public.backups IS 'Lab config and rota backups — auto (debounced on change) and manual (user-created)';
COMMENT ON COLUMN public.backups.config IS 'JSONB snapshot: departments, shifts, tasks, rules, coverage, team, preferences, settings';
COMMENT ON COLUMN public.backups.rotas IS 'JSONB array: weekly rota snapshots with assignments';
