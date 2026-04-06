-- Add rota_email_format column to organisations
-- Values: 'by_shift' (default, current behaviour) or 'by_person'
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS rota_email_format text NOT NULL DEFAULT 'by_shift';
