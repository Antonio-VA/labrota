-- Add parent_id to departments for sub-department nesting
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
