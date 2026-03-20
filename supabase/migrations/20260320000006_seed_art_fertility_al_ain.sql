-- ============================================================
-- Seed data — art-fertility-al-ain
-- Run in Supabase SQL editor after all schema migrations.
-- ============================================================

DO $$
DECLARE
  org_id uuid;

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
  -- ── Resolve organisation by slug ────────────────────────────────────────────
  SELECT id INTO org_id FROM public.organisations WHERE slug = 'art-fertility-al-ain';
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation art-fertility-al-ain not found.';
  END IF;

  -- ── Staff ───────────────────────────────────────────────────────────────────
  -- Shift → preferred_shift mapping:
  --   T1 (07:30–15:30) → am
  --   T2 (08:30–16:30) → pm
  --   T3 (09:00–17:00) → full
  --   T4 (09:30–17:30) → full

  INSERT INTO public.staff
    (organisation_id, first_name, last_name, role, preferred_shift, onboarding_status, start_date, days_per_week)
  VALUES
    (org_id, 'Hana',   'Kovač',   'lab',       'am',   'active', '2026-01-01', 5),
    (org_id, 'Tulsi',  'Patel',   'lab',       'am',   'active', '2026-01-01', 5),
    (org_id, 'Rida',   'Mansour', 'lab',       'pm',   'active', '2026-01-01', 5),
    (org_id, 'Sherin', 'Abbas',   'lab',       'pm',   'active', '2026-01-01', 5),
    (org_id, 'Eman',   'Khalil',  'lab',       'full', 'active', '2026-01-01', 5),
    (org_id, 'Neepa',  'Shah',    'lab',       'full', 'active', '2026-01-01', 5),
    (org_id, 'Meriem', 'Benali',  'lab',       'full', 'active', '2026-01-01', 5),
    (org_id, 'Omar',   'Reyes',   'andrology', 'am',   'active', '2026-01-01', 5),
    (org_id, 'Sara',   'Molina',  'admin',     'pm',   'active', '2026-01-01', 5)
  ON CONFLICT DO NOTHING;

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
  -- ICSI                      → icsi
  -- Recogida de óvulos        → egg_collection
  -- Denudación                → witnessing
  -- Transferencia embrionaria → other
  -- Biopsia                   → biopsy
  -- Análisis seminal          → semen_analysis
  -- Prep. espermática         → sperm_prep

  INSERT INTO public.staff_skills (organisation_id, staff_id, skill, level) VALUES
    -- Hana Kovač: ICSI, Recogida, Denudación
    (org_id, id_hana,   'icsi',           'certified'),
    (org_id, id_hana,   'egg_collection', 'certified'),
    (org_id, id_hana,   'witnessing',     'certified'),

    -- Tulsi Patel: Recogida, Denudación, Transferencia
    (org_id, id_tulsi,  'egg_collection', 'certified'),
    (org_id, id_tulsi,  'witnessing',     'certified'),
    (org_id, id_tulsi,  'other',          'certified'),

    -- Rida Mansour: ICSI, Biopsia, Transferencia
    (org_id, id_rida,   'icsi',           'certified'),
    (org_id, id_rida,   'biopsy',         'certified'),
    (org_id, id_rida,   'other',          'certified'),

    -- Sherin Abbas: ICSI, Biopsia, Denudación
    (org_id, id_sherin, 'icsi',           'certified'),
    (org_id, id_sherin, 'biopsy',         'certified'),
    (org_id, id_sherin, 'witnessing',     'certified'),

    -- Eman Khalil: Transferencia, ICSI
    (org_id, id_eman,   'other',          'certified'),
    (org_id, id_eman,   'icsi',           'certified'),

    -- Neepa Shah: Denudación, Biopsia, ICSI
    (org_id, id_neepa,  'witnessing',     'certified'),
    (org_id, id_neepa,  'biopsy',         'certified'),
    (org_id, id_neepa,  'icsi',           'certified'),

    -- Meriem Benali: Transferencia, Biopsia
    (org_id, id_meriem, 'other',          'certified'),
    (org_id, id_meriem, 'biopsy',         'certified'),

    -- Omar Reyes: Análisis seminal, Prep. espermática
    (org_id, id_omar,   'semen_analysis', 'certified'),
    (org_id, id_omar,   'sperm_prep',     'certified')

    -- Sara Molina: no skills
  ON CONFLICT (staff_id, skill) DO NOTHING;

  -- ── Lab config ──────────────────────────────────────────────────────────────
  -- T1 (07:30–15:30) → am
  -- T2 (08:30–16:30) → pm
  -- T3 (09:00–17:00) → full  (T4 at 09:30 is closest to full)

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
    3,      -- min lab weekday
    1,      -- min lab weekend
    1,      -- min andrology weekday
    0,      -- andrology weekend OFF
    6,
    3,
    false,  -- admin weekend OFF
    '{"mon":6,"tue":6,"wed":6,"thu":6,"fri":4,"sat":2,"sun":0}'::jsonb,
    '07:30', '15:30',
    '08:30', '16:30',
    '09:00', '17:00'
  )
  ON CONFLICT (organisation_id) DO UPDATE SET
    min_lab_coverage         = EXCLUDED.min_lab_coverage,
    min_weekend_lab_coverage = EXCLUDED.min_weekend_lab_coverage,
    min_andrology_coverage   = EXCLUDED.min_andrology_coverage,
    min_weekend_andrology    = EXCLUDED.min_weekend_andrology,
    punctions_average        = EXCLUDED.punctions_average,
    staffing_ratio           = EXCLUDED.staffing_ratio,
    admin_on_weekends        = EXCLUDED.admin_on_weekends,
    punctions_by_day         = EXCLUDED.punctions_by_day,
    shift_am_start           = EXCLUDED.shift_am_start,
    shift_am_end             = EXCLUDED.shift_am_end,
    shift_pm_start           = EXCLUDED.shift_pm_start,
    shift_pm_end             = EXCLUDED.shift_pm_end,
    shift_full_start         = EXCLUDED.shift_full_start,
    shift_full_end           = EXCLUDED.shift_full_end;

END $$;
