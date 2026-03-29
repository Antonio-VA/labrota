-- Separate shift coverage from task coverage
-- shift_coverage = per-shift minimums (by_shift mode)
-- task_coverage  = per-technique minimums (by_task mode)

ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS shift_coverage_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shift_coverage_by_day jsonb DEFAULT null;

COMMENT ON COLUMN public.lab_config.shift_coverage_enabled IS 'Whether per-shift minimum coverage is active (by_shift rotation mode)';
COMMENT ON COLUMN public.lab_config.shift_coverage_by_day IS 'Per-shift per-day minimum coverage: { shift_code: { mon: N, tue: N, ... } }';

-- Migrate existing by_shift orgs: move shift-keyed data from task_coverage to shift_coverage
UPDATE lab_config lc
SET shift_coverage_enabled = lc.task_coverage_enabled,
    shift_coverage_by_day  = lc.task_coverage_by_day,
    task_coverage_enabled  = false,
    task_coverage_by_day   = null
FROM organisations o
WHERE o.id = lc.organisation_id
  AND o.rota_display_mode = 'by_shift'
  AND lc.task_coverage_enabled = true;
