-- Add a direct index on rota_assignments.staff_id.
--
-- The existing composite index (organisation_id, staff_id, date) cannot be
-- used efficiently by queries that filter by staff + date without also
-- constraining organisation_id — e.g. per-staff report lookups. A dedicated
-- staff_id index keeps those queries index-scan cheap.

CREATE INDEX IF NOT EXISTS idx_rota_assignments_staff_id
  ON public.rota_assignments(staff_id);
