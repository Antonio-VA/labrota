-- ============================================================
-- LabRota — Organisation Members (many-to-many)
-- Users can belong to multiple organisations.
-- profiles.organisation_id keeps pointing to the "active" org.
-- ============================================================

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.organisation_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text        NOT NULL DEFAULT 'admin',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON public.organisation_members(user_id);
CREATE INDEX idx_org_members_org_id  ON public.organisation_members(organisation_id);

-- ── Migrate existing data ─────────────────────────────────────────────────────
-- Copy current profiles.organisation_id memberships into organisation_members
INSERT INTO public.organisation_members (organisation_id, user_id)
SELECT organisation_id, id
FROM public.profiles
WHERE organisation_id IS NOT NULL
ON CONFLICT (organisation_id, user_id) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

-- Users can see all members of orgs they belong to
CREATE POLICY "members_read_own_orgs"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.profiles WHERE id = auth.uid()
    )
    OR user_id = auth.uid()
  );
