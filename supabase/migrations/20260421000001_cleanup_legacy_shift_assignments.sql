-- Remove rota_assignments whose shift_type code no longer exists in the org's
-- shift_types table.  These rows come from the pre-shift_types era when codes
-- like 'am', 'pm', and 'full' were hard-coded.  They are already invisible in
-- the UI (filtered out defensively in queries.ts) but occupy space and can
-- confuse future queries.
DELETE FROM public.rota_assignments ra
WHERE NOT EXISTS (
  SELECT 1 FROM public.shift_types st
  WHERE st.organisation_id = ra.organisation_id
    AND st.code = ra.shift_type
);
