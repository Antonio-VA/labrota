ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS enable_task_in_shift boolean DEFAULT false;

COMMENT ON COLUMN public.lab_config.enable_task_in_shift IS 'Show task/subdept assignment within shifts in by_shift mode';
