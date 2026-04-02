-- Performance indexes for hot query paths
-- Month-view assignments query: filters by organisation_id + date range (no rota_id)
CREATE INDEX IF NOT EXISTS idx_rota_assignments_org_date
  ON public.rota_assignments(organisation_id, date);

-- Approved leaves: most leave queries filter by status='approved'
CREATE INDEX IF NOT EXISTS idx_leaves_approved_date_range
  ON public.leaves(organisation_id, start_date, end_date)
  WHERE status = 'approved';
