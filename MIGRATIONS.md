# LabRota — Pending Migrations

Run these in order in the Supabase SQL editor before deploying new code.

## How to check what's been run

```sql
-- Check if a column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'staff' AND column_name = 'color';
```

## Pending Migrations (run all)

### 1. Staff color (hover highlighting)
```sql
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';
```

### 2. Default organisation preference
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_organisation_id uuid REFERENCES public.organisations(id);
```

### 3. Sub-departments
```sql
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
```

### 4. Assignment unique constraint (function_label support)
```sql
ALTER TABLE public.rota_assignments DROP CONSTRAINT IF EXISTS rota_assignments_rota_id_staff_id_date_key;
DROP INDEX IF EXISTS public.rota_assignments_rota_staff_date_fn_idx;
UPDATE public.rota_assignments SET function_label = '' WHERE function_label IS NULL;
ALTER TABLE public.rota_assignments ALTER COLUMN function_label SET DEFAULT '';
ALTER TABLE public.rota_assignments ALTER COLUMN function_label SET NOT NULL;
ALTER TABLE public.rota_assignments ADD CONSTRAINT rota_assignments_rota_staff_date_fn_key UNIQUE (rota_id, staff_id, date, function_label);
```

### 5. Shift rotation mode
```sql
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS shift_rotation text NOT NULL DEFAULT 'stable';
```

### 6. Shift active days (per-day toggles)
```sql
ALTER TABLE public.shift_types ADD COLUMN IF NOT EXISTS active_days text[] NOT NULL DEFAULT '{mon,tue,wed,thu,fri,sat,sun}';
```

### 7. Biopsy config (if not already run)
```sql
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_conversion_rate numeric NOT NULL DEFAULT 0.5;
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_day5_pct numeric NOT NULL DEFAULT 0.5;
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_day6_pct numeric NOT NULL DEFAULT 0.5;
```

## Run all at once

```sql
-- 1. Staff color
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';

-- 2. Default org
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_organisation_id uuid REFERENCES public.organisations(id);

-- 3. Sub-departments
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- 4. Assignment constraint
ALTER TABLE public.rota_assignments DROP CONSTRAINT IF EXISTS rota_assignments_rota_id_staff_id_date_key;
DROP INDEX IF EXISTS public.rota_assignments_rota_staff_date_fn_idx;
UPDATE public.rota_assignments SET function_label = '' WHERE function_label IS NULL;
ALTER TABLE public.rota_assignments ALTER COLUMN function_label SET DEFAULT '';
ALTER TABLE public.rota_assignments ALTER COLUMN function_label SET NOT NULL;
ALTER TABLE public.rota_assignments ADD CONSTRAINT rota_assignments_rota_staff_date_fn_key UNIQUE (rota_id, staff_id, date, function_label);

-- 5. Shift rotation
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS shift_rotation text NOT NULL DEFAULT 'stable';

-- 6. Shift active days
ALTER TABLE public.shift_types ADD COLUMN IF NOT EXISTS active_days text[] NOT NULL DEFAULT '{mon,tue,wed,thu,fri,sat,sun}';

-- 7. Biopsy config
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_conversion_rate numeric NOT NULL DEFAULT 0.5;
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_day5_pct numeric NOT NULL DEFAULT 0.5;
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS biopsy_day6_pct numeric NOT NULL DEFAULT 0.5;
```

All use `IF NOT EXISTS` / `IF EXISTS` so they're safe to re-run.
