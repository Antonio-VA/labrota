-- Rota templates: reusable weekly shift patterns
CREATE TABLE IF NOT EXISTS rota_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  assignments     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rota_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_all_rota_templates"
  ON rota_templates FOR ALL
  USING  (organisation_id = auth_organisation_id())
  WITH CHECK (organisation_id = auth_organisation_id());
