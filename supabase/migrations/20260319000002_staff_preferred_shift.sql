-- Add preferred_shift to staff table
-- Used as a soft constraint by the rota generator

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS preferred_shift text CHECK (preferred_shift IN ('am', 'pm', 'full'));
