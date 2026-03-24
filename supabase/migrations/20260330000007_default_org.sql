-- Add default organisation preference to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_organisation_id uuid REFERENCES public.organisations(id);
