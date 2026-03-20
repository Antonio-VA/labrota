-- ============================================================
-- Demo seed data — staff + lab config
-- Run in Supabase SQL editor after all schema migrations.
-- Uses the first (and only) organisation row.
-- ============================================================

DO $$
DECLARE
  org_id uuid;

  -- staff ids
  id_hana    uuid;
  id_tulsi   uuid;
  id_rida    uuid;
  id_sherin  uuid;
  id_eman    uuid;
  id_neepa   uuid;
  id_meriem  uuid;
  id_omar    uuid;
  id_sara    uuid;

BEGIN
  -- ── Resolve organisation ────────────────────────────────────────────────────
  SELECT id INTO org_id FROM public.organisations LIMIT 1;
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'No organisation found — create one in the admin portal first.';
  END IF;

  -- ── Staff ───────────────────────────────────────────────────────────────────
  -- preferred_shift: T1–T4 are all morning/day slots → 'am'
  -- days_per_week: standard 5-day week

  INSERT INTO public.staff
    (organisation_id, first_name, last_name, role, preferred_shift, onboarding_status, start_date, days_per_week)
  VALUES
    (org_id, 'Hana',   'Kovač',   'lab',       'am', 'active', '2026-01-01', 5),
    (org_id, 'Tulsi',  'Patel',   'lab',       'am', 'active', '2026-01-01', 5),
    (org_id, 'Rida',   'Mansour', 'lab',       'am', 'active', '2026-01-01', 5),
    (org_id, 'Sherin', 'Abbas',   'lab',       'am', 'active', '2026-01-01', 5),
    (org_id, 'Eman',   'Khalil',  'lab',       'am', 'active', '2026-01-01', 5),
    (org_id, 'Neepa',  'Shah',    'lab',       'am', 'active', '2026-01-01', 5),
    (org_id, 'Meriem', 'Benali',  'lab',       'am', 'active', '2026-01-01', 5),
    (org_id, 'Omar',   'Reyes',   'andrology', 'am', 'active', '2026-01-01', 5),
    (org_id, 'Sara',   'Molina',  'admin',     'am', 'active', '2026-01-01', 5)
  ON CONFLICT DO NOTHING;

  -- Resolve inserted IDs by name (safe for demo data)
  SELECT id INTO id_hana   FROM public.staff WHERE organisation_id = org_id AND first_name = 'Hana'   AND last_name = 'Kovač';
  SELECT id INTO id_tulsi  FROM public.staff WHERE organisation_id = org_id AND first_name = 'Tulsi'  AND last_name = 'Patel';
  SELECT id INTO id_rida   FROM public.staff WHERE organisation_id = org_id AND first_name = 'Rida'   AND last_name = 'Mansour';
  SELECT id INTO id_sherin FROM public.staff WHERE organisation_id = org_id AND first_name = 'Sherin' AND last_name = 'Abbas';
  SELECT id INTO id_eman   FROM public.staff WHERE organisation_id = org_id AND first_name = 'Eman'   AND last_name = 'Khalil';
  SELECT id INTO id_neepa  FROM public.staff WHERE organisation_id = org_id AND first_name = 'Neepa'  AND last_name = 'Shah';
  SELECT id INTO id_meriem FROM public.staff WHERE organisation_id = org_id AND first_name = 'Meriem' AND last_name = 'Benali';
  SELECT id INTO id_omar   FROM public.staff WHERE organisation_id = org_id AND first_name = 'Omar'   AND last_name = 'Reyes';
  SELECT id INTO id_sara   FROM public.staff WHERE organisation_id = org_id AND first_name = 'Sara'   AND last_name = 'Molina';

  -- ── Skills ──────────────────────────────────────────────────────────────────
  -- Skill mapping:
  --   ICSI                    → icsi
  --   Recogida de óvulos      → egg_collection
  --   Denudación              → witnessing  (closest available enum value)
  --   Transferencia embrionaria → other
  --   Biopsia                 → biopsy
  --   Análisis seminal        → semen_analysis
  --   Preparación espermática → sperm_prep

  INSERT INTO public.staff_skills (organisation_id, staff_id, skill) VALUES
    -- Hana Kovač: ICSI, Recogida de óvulos, Denudación
    (org_id, id_hana,   'icsi'),
    (org_id, id_hana,   'egg_collection'),
    (org_id, id_hana,   'witnessing'),

    -- Tulsi Patel: Recogida de óvulos, Denudación, Transferencia embrionaria
    (org_id, id_tulsi,  'egg_collection'),
    (org_id, id_tulsi,  'witnessing'),
    (org_id, id_tulsi,  'other'),

    -- Rida Mansour: ICSI, Biopsia, Transferencia embrionaria
    (org_id, id_rida,   'icsi'),
    (org_id, id_rida,   'biopsy'),
    (org_id, id_rida,   'other'),

    -- Sherin Abbas: ICSI, Biopsia, Denudación
    (org_id, id_sherin, 'icsi'),
    (org_id, id_sherin, 'biopsy'),
    (org_id, id_sherin, 'witnessing'),

    -- Eman Khalil: Transferencia embrionaria, ICSI
    (org_id, id_eman,   'other'),
    (org_id, id_eman,   'icsi'),

    -- Neepa Shah: Denudación, Biopsia, ICSI
    (org_id, id_neepa,  'witnessing'),
    (org_id, id_neepa,  'biopsy'),
    (org_id, id_neepa,  'icsi'),

    -- Meriem Benali: Transferencia embrionaria, Biopsia
    (org_id, id_meriem, 'other'),
    (org_id, id_meriem, 'biopsy'),

    -- Omar Reyes: Análisis seminal, Preparación espermática
    (org_id, id_omar,   'semen_analysis'),
    (org_id, id_omar,   'sperm_prep')

    -- Sara Molina: no skills
  ON CONFLICT (staff_id, skill) DO NOTHING;

  -- ── Lab config ──────────────────────────────────────────────────────────────
  -- Shift times based on T1 (07:30–15:30) as the primary AM slot.
  -- The system supports one set of am/pm/full times; T1 is the earliest.
  -- Andrology weekend OFF → min_weekend_andrology = 0.

  INSERT INTO public.lab_config (
    organisation_id,
    min_lab_coverage,
    min_weekend_lab_coverage,
    min_andrology_coverage,
    min_weekend_andrology,
    punctions_average,
    staffing_ratio,
    admin_on_weekends,
    punctions_by_day,
    shift_am_start,   shift_am_end,
    shift_pm_start,   shift_pm_end,
    shift_full_start, shift_full_end
  ) VALUES (
    org_id,
    3,      -- min lab weekday coverage
    1,      -- min lab weekend coverage
    1,      -- min andrology weekday coverage
    0,      -- andrology weekend: OFF
    6,      -- punctions average (used as fallback)
    3,      -- staffing ratio
    false,  -- admin on weekends
    '{"mon":6,"tue":6,"wed":6,"thu":6,"fri":4,"sat":2,"sun":0}'::jsonb,
    '07:30', '15:30',   -- AM  = T1
    '14:30', '21:30',   -- PM  (not in use for this clinic, kept as default)
    '07:30', '21:30'    -- FULL
  )
  ON CONFLICT (organisation_id) DO UPDATE SET
    min_lab_coverage        = EXCLUDED.min_lab_coverage,
    min_weekend_lab_coverage= EXCLUDED.min_weekend_lab_coverage,
    min_andrology_coverage  = EXCLUDED.min_andrology_coverage,
    min_weekend_andrology   = EXCLUDED.min_weekend_andrology,
    punctions_average       = EXCLUDED.punctions_average,
    staffing_ratio          = EXCLUDED.staffing_ratio,
    admin_on_weekends       = EXCLUDED.admin_on_weekends,
    punctions_by_day        = EXCLUDED.punctions_by_day,
    shift_am_start          = EXCLUDED.shift_am_start,
    shift_am_end            = EXCLUDED.shift_am_end,
    shift_pm_start          = EXCLUDED.shift_pm_start,
    shift_pm_end            = EXCLUDED.shift_pm_end,
    shift_full_start        = EXCLUDED.shift_full_start,
    shift_full_end          = EXCLUDED.shift_full_end;

END $$;
