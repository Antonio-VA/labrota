-- ============================================================
-- Outlook connection audit trigger
--
-- outlook_connections.staff_id has ON DELETE CASCADE, so an Outlook
-- connection silently disappears when the linked staff row (or its
-- organisation) is deleted. Without a trail, there is no record of
-- which Microsoft account was previously authorised for which staff
-- member, which matters for:
--   - incident review (e.g. "was X's calendar still being synced
--     on date Y?")
--   - demonstrating revocation compliance (GDPR art. 30)
--
-- This BEFORE DELETE trigger captures every deletion — explicit or
-- cascade — into audit_logs, preserving org_id, staff_id, microsoft
-- user id, and email for as long as audit_logs is retained.
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_outlook_connection_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    organisation_id,
    action,
    entity_type,
    entity_id,
    changes,
    metadata
  ) VALUES (
    OLD.organisation_id,
    'outlook_connection_deleted',
    'outlook_connection',
    OLD.id,
    jsonb_build_object(
      'staff_id', OLD.staff_id,
      'microsoft_user_id', OLD.microsoft_user_id,
      'email', OLD.email,
      'sync_enabled', OLD.sync_enabled,
      'last_synced_at', OLD.last_synced_at
    ),
    jsonb_build_object('deleted_at', now())
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_outlook_connection_audit_delete
  ON public.outlook_connections;

CREATE TRIGGER trg_outlook_connection_audit_delete
  BEFORE DELETE ON public.outlook_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.log_outlook_connection_delete();
