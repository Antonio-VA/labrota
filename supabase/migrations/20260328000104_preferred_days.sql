-- Separate preferred days (soft) from available days (hard constraint)
-- working_pattern remains the hard constraint (contracted days)
-- preferred_days is the soft preference within available days
ALTER TABLE staff ADD COLUMN IF NOT EXISTS preferred_days jsonb;
