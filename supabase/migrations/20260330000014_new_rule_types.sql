-- Add no_misma_tarea and no_librar_mismo_dia rule types
ALTER TABLE public.rota_rules DROP CONSTRAINT IF EXISTS rota_rules_type_check;
ALTER TABLE public.rota_rules ADD CONSTRAINT rota_rules_type_check CHECK (type IN (
  'no_coincidir',
  'supervisor_requerido',
  'max_dias_consecutivos',
  'distribucion_fines_semana',
  'no_turno_doble',
  'descanso_fin_de_semana',
  'no_misma_tarea',
  'no_librar_mismo_dia'
));
-- no_misma_tarea:        staff_ids = [A, B], params = {} → A and B cannot share same task on same day
-- no_librar_mismo_dia:   staff_ids = [A, B], params = {} → A and B cannot both be off on same day
