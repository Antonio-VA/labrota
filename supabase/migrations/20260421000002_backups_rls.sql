-- backups table was created without RLS, leaving it accessible to all authenticated users
-- across all organisations. Add standard org-isolation policy.
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backups_org_isolation"
  ON public.backups FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());
