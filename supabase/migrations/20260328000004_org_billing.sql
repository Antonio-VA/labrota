-- Add billing fields to organisations
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS billing_start date DEFAULT null,
  ADD COLUMN IF NOT EXISTS billing_end date DEFAULT null,
  ADD COLUMN IF NOT EXISTS billing_fee numeric(10,2) DEFAULT null;

COMMENT ON COLUMN public.organisations.billing_start IS 'Billing period start date';
COMMENT ON COLUMN public.organisations.billing_end IS 'Billing period end date';
COMMENT ON COLUMN public.organisations.billing_fee IS 'Annual subscription fee';
