-- Add per-task coverage fields to lab_config
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS task_coverage_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_coverage_by_day jsonb DEFAULT null;

COMMENT ON COLUMN public.lab_config.task_coverage_enabled IS 'Whether per-task minimum coverage is active (vs only department-level)';
COMMENT ON COLUMN public.lab_config.task_coverage_by_day IS 'Per-task per-day minimum coverage: { tecnica_code: { mon: N, tue: N, ... } }';
