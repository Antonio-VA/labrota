-- ── Técnicas (lab procedures) ─────────────────────────────────────────────────
-- Configurable procedures performed in the lab. Each técnica maps to an optional
-- required canonical skill (biopsy, icsi, egg_collection, embryo_transfer, denudation).

CREATE TABLE IF NOT EXISTS tecnicas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  nombre_es       text        NOT NULL,
  nombre_en       text        NOT NULL DEFAULT '',
  codigo          text        NOT NULL,
  color           text        NOT NULL DEFAULT 'amber',
  required_skill  text,
  activa          boolean     NOT NULL DEFAULT true,
  orden           integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tecnica_codigo_max_len CHECK (char_length(codigo) BETWEEN 1 AND 3)
);

ALTER TABLE tecnicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_all_tecnicas"
  ON tecnicas FOR ALL
  USING  (organisation_id = auth_organisation_id())
  WITH CHECK (organisation_id = auth_organisation_id());

-- Link rota assignments to a técnica
ALTER TABLE rota_assignments
  ADD COLUMN IF NOT EXISTS tecnica_id uuid REFERENCES tecnicas(id) ON DELETE SET NULL;
