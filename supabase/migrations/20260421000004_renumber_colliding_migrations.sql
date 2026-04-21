-- Patches the `supabase_migrations.schema_migrations` tracking table to
-- match the nine filenames that were renumbered in this commit.
--
-- Why this is needed:
-- Nine migration files previously shared timestamps with other files on
-- the same date. Supabase tracks applied migrations by (version, name), so
-- when the CLI computes the diff between disk and tracking table, renamed
-- files look brand-new and it will try to re-apply them — which fails on
-- duplicate column / table errors.
--
-- This migration rewrites the tracking-table rows to the new (version, name)
-- pairs before any schema change is attempted. It is idempotent:
--   * If the old row exists it is updated to the new version.
--   * If the new row already exists (e.g. after re-running against a DB
--     that already went through this migration) nothing happens.
--   * On a clean/fresh DB the old rows simply don't exist, and the
--     renumbered files get applied as first-time migrations with their
--     new timestamps — the UPDATE is a harmless no-op.

DO $$
DECLARE
  renames text[][] := ARRAY[
    ARRAY['20260320000001', 'rota_features',                   '20260320000101'],
    ARRAY['20260328000001', 'staff_avoid_preferences',         '20260328000101'],
    ARRAY['20260328000002', 'tecnicas_avoid_shifts',           '20260328000102'],
    ARRAY['20260328000003', 'task_coverage',                   '20260328000103'],
    ARRAY['20260328000004', 'preferred_days',                  '20260328000104'],
    ARRAY['20260328000005', 'tecnicas_department',             '20260328000105'],
    ARRAY['20260328000006', 'skill_to_text',                   '20260328000106'],
    ARRAY['20260328000007', 'migrate_skills_to_tecnica_codes', '20260328000107'],
    ARRAY['20260330000015', 'rule_expiry',                     '20260330000115']
  ];
  r text[];
BEGIN
  -- Only proceed if the tracking table exists (fresh DBs won't have it yet).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    RAISE NOTICE 'supabase_migrations.schema_migrations does not exist yet; skipping renumber.';
    RETURN;
  END IF;

  FOREACH r SLICE 1 IN ARRAY renames LOOP
    -- Skip if the new row already exists (re-run on already-patched DB).
    IF EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = r[3] AND name = r[2]
    ) THEN
      CONTINUE;
    END IF;

    -- Rewrite the old (version, name) → new (version, name).
    UPDATE supabase_migrations.schema_migrations
       SET version = r[3]
     WHERE version = r[1] AND name = r[2];
  END LOOP;
END $$;
