-- Migrate public_holiday_mode values from old format to new
-- "normal" → "weekday", "saturday_coverage" → "saturday"
UPDATE public.lab_config SET public_holiday_mode = 'weekday' WHERE public_holiday_mode = 'normal';
UPDATE public.lab_config SET public_holiday_mode = 'saturday' WHERE public_holiday_mode = 'saturday_coverage';
-- Set default for any NULLs
UPDATE public.lab_config SET public_holiday_mode = 'weekday' WHERE public_holiday_mode IS NULL;
