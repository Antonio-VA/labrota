-- Add tecnicas_juntas, tarea_multidepartamento, equipo_completo rule types
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
  'restriccion_dia_tecnica',
  'asignacion_fija',
  'tecnicas_juntas',
  'tarea_multidepartamento',
  'equipo_completo'
));
-- tecnicas_juntas: params = { tecnica_codes: string[], days?: string[] }
-- tarea_multidepartamento: params = { tecnica_code: string, departments: string[], days?: string[] }
-- equipo_completo: params = { tecnica_codes: string[], days?: string[] }
