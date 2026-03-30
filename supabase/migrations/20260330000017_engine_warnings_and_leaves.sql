-- Add engine_warnings column to rotas table
ALTER TABLE rotas ADD COLUMN IF NOT EXISTS engine_warnings jsonb;

-- Add cancelled status to leave_status enum
ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Add review tracking columns to leaves
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id);
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
