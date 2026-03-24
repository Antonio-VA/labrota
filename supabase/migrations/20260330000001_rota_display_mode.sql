-- Add rota display mode to organisations (super admin setting)
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS rota_display_mode text NOT NULL DEFAULT 'by_shift';

-- Add task conflict threshold to lab_config (lab manager setting)
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS task_conflict_threshold integer NOT NULL DEFAULT 3;

-- Add whole_team flag to rota_assignments for "All" assignment
ALTER TABLE public.rota_assignments ADD COLUMN IF NOT EXISTS whole_team boolean NOT NULL DEFAULT false;
