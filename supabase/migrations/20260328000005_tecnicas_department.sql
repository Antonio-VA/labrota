-- Add department to técnicas so they can be filtered by role
ALTER TABLE tecnicas ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'lab';
