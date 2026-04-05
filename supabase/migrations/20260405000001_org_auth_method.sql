-- Add auth_method to organisations
-- 'password' = password-first login (default), 'otp' = magic code only
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'password'
  CONSTRAINT valid_auth_method CHECK (auth_method IN ('otp', 'password'));
