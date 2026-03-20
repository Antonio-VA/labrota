-- ============================================================
-- Add display_name to organisation_members
-- Allows the same user to appear under a different name per org.
-- display_name is org-specific; profiles.full_name is the global account name.
-- ============================================================

ALTER TABLE public.organisation_members
  ADD COLUMN IF NOT EXISTS display_name text;
