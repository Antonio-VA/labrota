-- Add per-day-per-role minimum coverage column to lab_config.
-- Replaces the four flat columns (min_lab_coverage, min_andrology_coverage,
-- min_weekend_andrology, min_weekend_lab_coverage) for rota generation purposes.
-- Old columns are kept for backward compatibility but the engine prefers coverage_by_day.

ALTER TABLE lab_config
ADD COLUMN IF NOT EXISTS coverage_by_day JSONB DEFAULT '{
  "mon": {"lab": 3, "andrology": 1, "admin": 1},
  "tue": {"lab": 3, "andrology": 1, "admin": 1},
  "wed": {"lab": 3, "andrology": 1, "admin": 1},
  "thu": {"lab": 3, "andrology": 1, "admin": 1},
  "fri": {"lab": 3, "andrology": 1, "admin": 1},
  "sat": {"lab": 1, "andrology": 0, "admin": 0},
  "sun": {"lab": 0, "andrology": 0, "admin": 0}
}'::jsonb;
