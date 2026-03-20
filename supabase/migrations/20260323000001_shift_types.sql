-- ============================================================
-- Shift Types: replace hardcoded am/pm/full with dynamic org-defined shift types
-- ============================================================

-- 1. Create shift_types table
CREATE TABLE IF NOT EXISTS public.shift_types (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  code            text        NOT NULL CHECK (char_length(code) BETWEEN 1 AND 3),
  name_es         text        NOT NULL DEFAULT '',
  name_en         text        NOT NULL DEFAULT '',
  start_time      text        NOT NULL DEFAULT '07:30',
  end_time        text        NOT NULL DEFAULT '15:30',
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, code)
);

CREATE INDEX IF NOT EXISTS shift_types_org_idx ON public.shift_types (organisation_id);
CREATE INDEX IF NOT EXISTS shift_types_sort_idx ON public.shift_types (organisation_id, sort_order);

ALTER TABLE public.shift_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage shift types"
  ON public.shift_types FOR ALL
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- 2. Seed default shifts T1–T4 for every existing organisation
INSERT INTO public.shift_types (organisation_id, code, name_es, name_en, start_time, end_time, sort_order)
SELECT
  o.id,
  shifts.code,
  shifts.name_es,
  shifts.name_en,
  shifts.start_time,
  shifts.end_time,
  shifts.sort_order
FROM public.organisations o
CROSS JOIN (VALUES
  ('T1', 'Mañana',       'Morning',          '07:30', '15:30', 0),
  ('T2', 'Tarde',        'Afternoon',        '08:30', '16:30', 1),
  ('T3', 'Tarde-tarde',  'Late afternoon',   '09:00', '17:00', 2),
  ('T4', 'Noche',        'Evening',          '09:30', '17:30', 3)
) AS shifts(code, name_es, name_en, start_time, end_time, sort_order)
ON CONFLICT (organisation_id, code) DO NOTHING;

-- 3. Convert rota_assignments.shift_type from ENUM to text (required for dynamic codes)
ALTER TABLE public.rota_assignments
  ALTER COLUMN shift_type TYPE text USING shift_type::text;

-- 4. Migrate existing 'am'/'pm'/'full' assignments to T1/T2/T3
UPDATE public.rota_assignments SET shift_type = 'T1' WHERE shift_type = 'am';
UPDATE public.rota_assignments SET shift_type = 'T2' WHERE shift_type = 'pm';
UPDATE public.rota_assignments SET shift_type = 'T3' WHERE shift_type = 'full';

-- 5. Migrate staff.preferred_shift (drop old CHECK constraint, widen to text, update values)
ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_preferred_shift_check;

UPDATE public.staff SET preferred_shift = 'T1' WHERE preferred_shift = 'am';
UPDATE public.staff SET preferred_shift = 'T2' WHERE preferred_shift = 'pm';
UPDATE public.staff SET preferred_shift = 'T3' WHERE preferred_shift = 'full';

-- 6. Migrate lab_config.admin_default_shift — add column if missing, update values
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS admin_default_shift text;

UPDATE public.lab_config SET admin_default_shift = 'T1' WHERE admin_default_shift = 'am';
UPDATE public.lab_config SET admin_default_shift = 'T2' WHERE admin_default_shift = 'pm';
UPDATE public.lab_config SET admin_default_shift = 'T3' WHERE admin_default_shift = 'full';
-- Default any null admin_default_shift to 'T1'
UPDATE public.lab_config SET admin_default_shift = 'T1' WHERE admin_default_shift IS NULL;
