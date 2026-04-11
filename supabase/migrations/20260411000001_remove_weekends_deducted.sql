-- Remove weekends_deducted from holiday_config
-- Calendar days mode now always counts all days (weekends included).
-- Working days mode already excludes weekends by definition.
ALTER TABLE public.holiday_config DROP COLUMN IF EXISTS weekends_deducted;
