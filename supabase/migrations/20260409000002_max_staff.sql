-- Add per-organisation staff creation limit (default 50)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS max_staff integer NOT NULL DEFAULT 50;
