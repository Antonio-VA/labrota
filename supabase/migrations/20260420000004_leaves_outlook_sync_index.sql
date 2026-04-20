-- ============================================================
-- Partial index for Outlook sync leaves lookup
--
-- syncStaffOutlook runs every few minutes per connected staff and
-- issues:
--   SELECT id, outlook_event_id, start_date, end_date, type
--   FROM leaves
--   WHERE staff_id = $1 AND organisation_id = $2
--     AND source = 'outlook' AND end_date >= $today
--
-- The existing indexes cover either (staff_id) or (org_id, source)
-- individually, so the planner has to do an extra filter pass over
-- every historical Outlook leave for the staff member. A narrow
-- partial index on the Outlook subset makes this an index-only scan
-- and stays small because source='outlook' is a tiny slice of rows.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_leaves_outlook_active
  ON public.leaves (staff_id, end_date)
  WHERE source = 'outlook';
