-- Add typical shifts to técnicas (soft constraint for rota generation)
ALTER TABLE tecnicas ADD COLUMN IF NOT EXISTS typical_shifts jsonb NOT NULL DEFAULT '[]'::jsonb;
