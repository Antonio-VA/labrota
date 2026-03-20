-- Add embryo_transfer and denudation to skill_name enum
ALTER TYPE public.skill_name ADD VALUE IF NOT EXISTS 'embryo_transfer';
ALTER TYPE public.skill_name ADD VALUE IF NOT EXISTS 'denudation';
