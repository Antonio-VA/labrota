-- Add restriccion_dia_tecnica rule type to rota_rules CHECK constraint
ALTER TABLE public.rota_rules DROP CONSTRAINT IF EXISTS rota_rules_type_check;
ALTER TABLE public.rota_rules ADD CONSTRAINT rota_rules_type_check CHECK (type IN (
  'no_coincidir',
  'supervisor_requerido',
  'max_dias_consecutivos',
  'distribucion_fines_semana',
  'no_turno_doble',
  'descanso_fin_de_semana',
  'no_misma_tarea',
  'no_librar_mismo_dia',
  'restriccion_dia_tecnica'
));
-- restriccion_dia_tecnica: staff_ids = [], params = { tecnica_code, dayMode: "never"|"only", restrictedDays: string[] }
