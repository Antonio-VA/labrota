-- Add level column to staff_skills
-- Existing rows default to 'certified' (backwards-compatible)
ALTER TABLE staff_skills
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'certified'
    CHECK (level IN ('certified', 'training'));
