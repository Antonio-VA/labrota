-- ============================================================
-- Org-scope leave attachments
--
-- The original migration (20260412000001) opened `storage.objects` to
-- any authenticated user for the `leave-attachments` bucket, filtering
-- only by `bucket_id`. Combined with the enumerable `${user_id}/${ts}.ext`
-- path format, that let any authenticated user across any org read or
-- overwrite medical attachments belonging to other orgs.
--
-- New model: drop both permissive policies. With no policy, authenticated
-- clients cannot touch `storage.objects` in this bucket at all; only the
-- service-role admin client (which bypasses RLS) can read or write.
-- All downloads now go through `/api/leave-attachment/[id]`, which looks
-- up the leave row under the caller's RLS scope (org-isolated) before
-- minting a short-lived signed URL.
-- ============================================================

DROP POLICY IF EXISTS "Users can upload leave attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read leave attachments" ON storage.objects;

-- Rewrite legacy public-URL values to bare storage paths so the new
-- proxy route can sign them. The old URL format was
-- `${SUPABASE_URL}/storage/v1/object/public/leave-attachments/${path}`.
UPDATE public.leaves
SET attachment_url = substring(attachment_url FROM '/leave-attachments/(.*)$')
WHERE attachment_url IS NOT NULL
  AND attachment_url LIKE '%/leave-attachments/%';
