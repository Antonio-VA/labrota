-- ============================================================
-- Enable RLS on swap_requests
-- The original migration (20260407000001) created the table without
-- row-level security, so any authenticated user could read/write
-- swap requests across organisations. Mirror the pattern used for
-- outlook_connections and other org-scoped tables.
-- ============================================================

ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap_requests_org_isolation"
  ON public.swap_requests FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());
