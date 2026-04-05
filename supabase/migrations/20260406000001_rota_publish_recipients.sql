-- Rota publish notification recipients
-- Stores per-org preferences for who receives email when a rota is published.

CREATE TABLE public.rota_publish_recipients (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  -- For internal users (have a profile):
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  -- For external recipients (no account):
  external_email  text,
  external_name   text,
  -- Toggle
  enabled         boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Either user_id or external_email must be set
  CONSTRAINT check_recipient CHECK (
    (user_id IS NOT NULL AND external_email IS NULL) OR
    (user_id IS NULL AND external_email IS NOT NULL)
  ),
  UNIQUE (organisation_id, user_id),
  UNIQUE (organisation_id, external_email)
);

-- RLS
ALTER TABLE public.rota_publish_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view recipients"
  ON public.rota_publish_recipients FOR SELECT
  USING (organisation_id = public.auth_organisation_id());

CREATE POLICY "Org members can insert recipients"
  ON public.rota_publish_recipients FOR INSERT
  WITH CHECK (organisation_id = public.auth_organisation_id());

CREATE POLICY "Org members can update recipients"
  ON public.rota_publish_recipients FOR UPDATE
  USING (organisation_id = public.auth_organisation_id());

CREATE POLICY "Org members can delete recipients"
  ON public.rota_publish_recipients FOR DELETE
  USING (organisation_id = public.auth_organisation_id());

-- Index for fast lookup on publish
CREATE INDEX idx_rota_publish_recipients_org ON public.rota_publish_recipients (organisation_id) WHERE enabled = true;
