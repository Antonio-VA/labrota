-- Add descanso_fin_de_semana rule type to rota_rules CHECK constraint
ALTER TABLE public.rota_rules DROP CONSTRAINT IF EXISTS rota_rules_type_check;
ALTER TABLE public.rota_rules ADD CONSTRAINT rota_rules_type_check CHECK (type IN (
  'no_coincidir',
  'supervisor_requerido',
  'max_dias_consecutivos',
  'distribucion_fines_semana',
  'no_turno_doble',
  'descanso_fin_de_semana'
));
-- params for descanso_fin_de_semana:
--   { "recovery": "following" | "previous", "restDays": 2 }
--   recovery = "following" → works weekend N, off weekend N+1 + 2 contiguous rest days
--   recovery = "previous"  → works weekend N, was off weekend N-1 + had 2 contiguous rest days
