-- ============================================================
-- LabRota — Rota Rules
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rota_rules (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  type             text        NOT NULL CHECK (type IN (
    'no_coincidir',
    'supervisor_requerido',
    'max_dias_consecutivos',
    'distribucion_fines_semana',
    'no_turno_doble'
  )),
  is_hard          boolean     NOT NULL DEFAULT false,
  enabled          boolean     NOT NULL DEFAULT true,
  staff_ids        uuid[]      NOT NULL DEFAULT '{}',
  -- empty array = applies to all staff in the org
  params           jsonb       NOT NULL DEFAULT '{}',
  -- per-type params:
  --   no_coincidir              → {}
  --   supervisor_requerido      → { "skill": "icsi" }
  --   max_dias_consecutivos     → { "max_days": 5 }
  --   distribucion_fines_semana → { "max_per_month": 2 }
  --   no_turno_doble            → {}
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rota_rules_org_idx ON public.rota_rules (organisation_id);

ALTER TABLE public.rota_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage their rules"
  ON public.rota_rules FOR ALL
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());
