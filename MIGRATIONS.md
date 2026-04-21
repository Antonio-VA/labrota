# LabRota — Pending Migrations

Run these in order in the Supabase SQL editor before deploying new code.

## Migration-timestamp collisions (resolved)

Nine files previously shared timestamps with other files on the same date.
They have been renumbered:

| Original (kept)                                       | Renumbered file (was same timestamp)                           |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `20260320000001_rota_assignments_function_label.sql`  | `20260320000101_rota_features.sql`                             |
| `20260328000001_rota_templates.sql`                   | `20260328000101_staff_avoid_preferences.sql`                   |
| `20260328000002_rota_generation_type.sql`             | `20260328000102_tecnicas_avoid_shifts.sql`                     |
| `20260328000003_andrology_skills.sql`                 | `20260328000103_task_coverage.sql`                             |
| `20260328000004_org_billing.sql`                      | `20260328000104_preferred_days.sql`                            |
| `20260328000005_enable_task_in_shift.sql`             | `20260328000105_tecnicas_department.sql`                       |
| `20260328000006_implementation_steps.sql`             | `20260328000106_skill_to_text.sql`                             |
| `20260328000007_backups.sql`                          | `20260328000107_migrate_skills_to_tecnica_codes.sql`           |
| `20260330000015_restriccion_dia_tecnica_rule.sql`     | `20260330000115_rule_expiry.sql`                               |

The renames are paired with `20260421000004_renumber_colliding_migrations.sql`,
which rewrites `supabase_migrations.schema_migrations` atomically so the
Supabase CLI treats the renumbered files as already-applied on databases
that had the old timestamps applied. The renumber migration is idempotent —
it's a no-op on a fresh DB and on DBs that have already been patched.

**Deploying this change:** apply migrations as usual (`supabase db push` or
the Supabase dashboard). The renumber migration runs before the CLI tries
to apply the renumbered files as "new", so no manual coordination is
required.

**Future guideline:** keep new migrations strictly after the highest
existing timestamp. Don't reuse timestamps, even within the same PR.

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

-- 8. Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  changes jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_org_idx ON public.audit_logs (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action, created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Org members can read their own audit logs"
    ON public.audit_logs FOR SELECT
    USING (organisation_id IN (
      SELECT om.organisation_id FROM public.organisation_members om WHERE om.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 9. Linked staff for viewer users
ALTER TABLE public.organisation_members ADD COLUMN IF NOT EXISTS linked_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
```

### 9. Linked staff for viewer users
```sql
ALTER TABLE public.organisation_members ADD COLUMN IF NOT EXISTS linked_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
```

### 10. Leave request feature toggle
```sql
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS enable_leave_requests boolean NOT NULL DEFAULT false;
```

### 11. Rota snapshots (version history)
```sql
CREATE TABLE IF NOT EXISTS public.rota_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  rota_id         uuid        NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  week_start      date        NOT NULL,
  assignments     jsonb       NOT NULL DEFAULT '[]',
  user_id         uuid,
  user_email      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rota_snapshots_week_idx ON public.rota_snapshots (organisation_id, week_start, date, created_at DESC);
ALTER TABLE public.rota_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Org members can manage rota snapshots"
    ON public.rota_snapshots FOR ALL
    USING (organisation_id IN (
      SELECT om.organisation_id FROM public.organisation_members om WHERE om.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
```

All use `IF NOT EXISTS` / `IF EXISTS` so they're safe to re-run.
