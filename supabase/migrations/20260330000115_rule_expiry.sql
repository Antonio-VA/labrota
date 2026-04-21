-- Add optional expiry date to rota_rules
ALTER TABLE public.rota_rules
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.rota_rules.expires_at IS 'Optional expiration date — rule is ignored after this date';
