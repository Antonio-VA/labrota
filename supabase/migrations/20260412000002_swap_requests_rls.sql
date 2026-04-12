-- ============================================================
-- Enable RLS on swap_requests (was missing from initial migration)
-- ============================================================

ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap_requests_org_isolation"
  ON public.swap_requests FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());
