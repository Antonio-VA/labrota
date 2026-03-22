-- Remove staff_skills records that don't match any active técnica code
-- This cleans up corrupted/test data like AND, QC, TUB, TW, VIT etc.
DELETE FROM staff_skills ss
WHERE NOT EXISTS (
  SELECT 1 FROM tecnicas t
  WHERE t.codigo = ss.skill
  AND t.organisation_id = ss.organisation_id
)
-- Also keep legacy names that were migrated (in case migration hasn't run)
AND ss.skill NOT IN ('OPU', 'ICS', 'ET', 'BX', 'DEN', 'CNG', 'SEM', 'PRE');
