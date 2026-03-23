-- Add 'training' and 'maternity' to leave_type enum
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'training';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'maternity';
