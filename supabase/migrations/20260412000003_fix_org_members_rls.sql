-- ============================================================
-- Fix organisation_members RLS policy
--
-- Old policy used profiles.organisation_id (active org only)
-- plus OR user_id = auth.uid() which allowed seeing own rows
-- from any org regardless of actual membership.
--
-- New approach: SECURITY DEFINER helper returns all org IDs
-- the user belongs to, avoiding RLS recursion. Single clean
-- condition replaces the flawed OR logic.
-- ============================================================

-- Helper: returns all organisation_ids the user is a member of.
-- SECURITY DEFINER bypasses RLS on organisation_members itself.
CREATE OR REPLACE FUNCTION public.auth_organisation_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organisation_id
  FROM public.organisation_members
  WHERE user_id = auth.uid()
$$;

-- Replace the old policy
DROP POLICY IF EXISTS "members_read_own_orgs" ON public.organisation_members;

CREATE POLICY "members_read_own_orgs"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (SELECT public.auth_organisation_ids())
  );
