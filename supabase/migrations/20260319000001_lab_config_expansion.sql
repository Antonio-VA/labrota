-- Lab config expansion: weekend Lab coverage, per-day punctions,
-- autonomous community (regional holidays), customisable shift names.

ALTER TABLE lab_config
  ADD COLUMN IF NOT EXISTS min_weekend_lab_coverage integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS punctions_by_day jsonb NOT NULL DEFAULT '{"mon":6,"tue":6,"wed":6,"thu":6,"fri":6,"sat":2,"sun":0}'::jsonb,
  ADD COLUMN IF NOT EXISTS autonomous_community text,
  ADD COLUMN IF NOT EXISTS shift_name_am_es   text NOT NULL DEFAULT 'Mañana',
  ADD COLUMN IF NOT EXISTS shift_name_pm_es   text NOT NULL DEFAULT 'Tarde',
  ADD COLUMN IF NOT EXISTS shift_name_full_es text NOT NULL DEFAULT 'Completo',
  ADD COLUMN IF NOT EXISTS shift_name_am_en   text NOT NULL DEFAULT 'Morning',
  ADD COLUMN IF NOT EXISTS shift_name_pm_en   text NOT NULL DEFAULT 'Afternoon',
  ADD COLUMN IF NOT EXISTS shift_name_full_en text NOT NULL DEFAULT 'Full Day';
