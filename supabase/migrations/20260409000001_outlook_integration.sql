-- ============================================================
-- Outlook Calendar Integration
-- Adds outlook_connections table, source tracking on leaves,
-- and feature flag on lab_config.
-- ============================================================

-- ── outlook_connections ──────────────────────────────────────────────────────
-- One row per staff member with a connected Microsoft Outlook account.
-- Tokens are encrypted at the application layer (AES-256-GCM).
CREATE TABLE public.outlook_connections (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  staff_id          uuid        NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  microsoft_user_id text        NOT NULL,
  email             text        NOT NULL,
  access_token      text        NOT NULL,
  refresh_token     text        NOT NULL,
  token_expires_at  timestamptz NOT NULL,
  last_synced_at    timestamptz,
  sync_enabled      boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outlook_connections_org  ON public.outlook_connections(organisation_id);
CREATE INDEX idx_outlook_connections_sync ON public.outlook_connections(sync_enabled, token_expires_at);

-- RLS
ALTER TABLE public.outlook_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outlook_connections_org_isolation"
  ON public.outlook_connections FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- updated_at trigger
CREATE TRIGGER trg_outlook_connections_updated_at
  BEFORE UPDATE ON public.outlook_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── leaves: add source tracking ──────────────────────────────────────────────
ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS outlook_event_id text;

ALTER TABLE public.leaves
  ADD CONSTRAINT leaves_source_check CHECK (source IN ('manual', 'outlook'));

CREATE INDEX idx_leaves_outlook_event ON public.leaves(outlook_event_id)
  WHERE outlook_event_id IS NOT NULL;

CREATE INDEX idx_leaves_source ON public.leaves(organisation_id, source)
  WHERE source != 'manual';

-- ── lab_config: feature flag ─────────────────────────────────────────────────
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS enable_outlook_sync boolean NOT NULL DEFAULT false;
