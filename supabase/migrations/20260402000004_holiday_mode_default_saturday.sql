-- Change public_holiday_mode default to 'saturday' and update existing 'weekday' rows
ALTER TABLE public.lab_config ALTER COLUMN public_holiday_mode SET DEFAULT 'saturday';
UPDATE public.lab_config SET public_holiday_mode = 'saturday' WHERE public_holiday_mode = 'weekday';
