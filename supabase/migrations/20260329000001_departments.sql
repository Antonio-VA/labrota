-- Configurable departments per organisation
CREATE TABLE IF NOT EXISTS departments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code            text        NOT NULL,  -- maps to staff.role values: 'lab', 'andrology', 'admin'
  name            text        NOT NULL,
  name_en         text        NOT NULL DEFAULT '',
  abbreviation    text        NOT NULL DEFAULT '',
  colour          text        NOT NULL DEFAULT '#94A3B8',
  is_default      boolean     NOT NULL DEFAULT false,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_all_departments"
  ON departments FOR ALL
  USING  (organisation_id = auth_organisation_id())
  WITH CHECK (organisation_id = auth_organisation_id());

-- Seed default departments for all existing organisations
INSERT INTO departments (organisation_id, code, name, name_en, abbreviation, colour, is_default, sort_order)
SELECT o.id, d.code, d.name, d.name_en, d.abbreviation, d.colour, true, d.sort_order
FROM organisations o
CROSS JOIN (VALUES
  ('lab',       'Embriología',    'Embryology',      'EM', '#60A5FA', 0),
  ('andrology', 'Andrología',     'Andrology',       'AN', '#34D399', 1),
  ('admin',     'Administración', 'Administration',  'AD', '#94A3B8', 2)
) AS d(code, name, name_en, abbreviation, colour, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM departments WHERE departments.organisation_id = o.id AND departments.code = d.code
);
