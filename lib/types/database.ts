// ============================================================
// LabRota — Database types
// Keep in sync with supabase/migrations/20260317000001_initial_schema.sql
// ============================================================

// ── Enums ────────────────────────────────────────────────────────────────────
export type StaffRole         = string  // maps to departments.code

export interface Department {
  id:              string
  organisation_id: string
  code:            string
  name:            string
  name_en:         string
  abbreviation:    string
  colour:          string
  is_default:      boolean
  sort_order:      number
  parent_id:       string | null
  created_at:      string
}
export type OnboardingStatus  = 'active' | 'onboarding' | 'inactive'
export type ContractType      = 'full_time' | 'part_time' | 'intern'
export type ShiftType         = string
export type RotaStatus        = 'draft' | 'published'
export type LeaveType         = 'annual' | 'sick' | 'personal' | 'training' | 'maternity' | 'other'
export type LeaveStatus       = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type SkillName = string

export type SkillLevel        = 'certified' | 'training'

export interface ShiftTypeDefinition {
  id:              string
  organisation_id: string
  code:            string
  name_es:         string
  name_en:         string
  start_time:      string
  end_time:        string
  sort_order:      number
  active:          boolean
  active_days:     string[]  // ["mon","tue","wed","thu","fri","sat","sun"]
  department_codes: string[] // deprecated — kept for DB compat, not used for filtering
  created_at:      string
}
export type WorkingDay        = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WorkingPattern    = WorkingDay[]

// ── Row types (what you get back from SELECT) ─────────────────────────────────
export type RotaDisplayMode = 'by_shift' | 'by_task'

export interface EngineConfig {
  aiOptimalVersion:     string   // 'v1' | 'v2'
  hybridEnabled:        boolean
  reasoningEnabled:     boolean
  taskOptimalVersion:   string   // 'v1' | 'v2'
  taskHybridEnabled:    boolean
  taskReasoningEnabled: boolean
}

export interface Organisation {
  id:                       string
  name:                     string
  slug:                     string
  is_active:                boolean
  logo_url:                 string | null
  rota_display_mode:        RotaDisplayMode
  billing_start:            string | null
  billing_end:              string | null
  billing_fee:              number | null
  ai_optimal_version:       string
  engine_hybrid_enabled:    boolean
  engine_reasoning_enabled: boolean
  task_optimal_version:     string
  task_hybrid_enabled:      boolean
  task_reasoning_enabled:   boolean
  daily_hybrid_limit:       number
  auth_method:              'otp' | 'password'
  rota_email_format:        'by_shift' | 'by_person'
  max_staff:                number
  created_at:               string
}

export interface Profile {
  id:                      string
  organisation_id:         string | null
  default_organisation_id: string | null
  email:                   string
  full_name:               string | null
  preferences:             Record<string, unknown> | null
  created_at:              string
  updated_at:              string
}

export interface Staff {
  id:                string
  organisation_id:   string
  first_name:        string
  last_name:         string
  email:             string | null
  role:              StaffRole
  working_pattern:   WorkingPattern
  preferred_days:    WorkingPattern | null
  avoid_days:        WorkingPattern | null
  contracted_hours:  number
  days_per_week:     number
  onboarding_status:    OnboardingStatus
  contract_type:        ContractType
  onboarding_end_date:  string | null   // ISO date — person doesn't count toward minimums until after this date
  prefers_guardia:      boolean         // opts in to weekend guardia duty
  preferred_shift:      ShiftType | null
  avoid_shifts:      string[] | null
  start_date:        string
  end_date:          string | null
  notes:             string | null
  color:             string
  created_at:        string
  updated_at:        string
}

export interface StaffSkill {
  id:              string
  organisation_id: string
  staff_id:        string
  skill:           SkillName
  level:           SkillLevel
  created_at:      string
}

export type LeaveSource = 'manual' | 'outlook'

export interface Leave {
  id:               string
  organisation_id:  string
  staff_id:         string
  type:             LeaveType
  start_date:       string
  end_date:         string
  status:           LeaveStatus
  source:           LeaveSource
  outlook_event_id: string | null
  notes:            string | null
  attachment_url:   string | null
  created_by:       string | null
  reviewed_by:      string | null
  reviewed_at:      string | null
  leave_type_id:    string | null
  days_counted:     number | null
  balance_year:     number | null
  uses_cf_days:     boolean
  cf_days_used:     number
  parent_leave_id:  string | null
  created_at:       string
  updated_at:       string
}

export type GenerationType = 'strict_template' | 'flexible_template' | 'ai_optimal' | 'ai_optimal_v2' | 'ai_reasoning' | 'ai_hybrid' | 'manual'

export interface Rota {
  id:                 string
  organisation_id:    string
  week_start:         string   // ISO date string — always a Monday
  status:             RotaStatus
  generation_type:    GenerationType | null
  published_at:       string | null
  published_by:       string | null
  punctions_override: Record<string, number> | null
  engine_warnings:    string[] | null
  created_at:         string
  updated_at:         string
}

export interface RotaAssignment {
  id:                 string
  organisation_id:    string
  rota_id:            string
  staff_id:           string
  date:               string
  shift_type:         ShiftType
  is_manual_override: boolean
  trainee_staff_id:   string | null
  notes:              string | null
  is_opu:             boolean
  function_label:     string | null
  tecnica_id:         string | null
  whole_team:         boolean
  created_at:         string
  updated_at:         string
}

export interface Tecnica {
  id:              string
  organisation_id: string
  nombre_es:       string
  nombre_en:       string
  codigo:          string
  color:           string
  required_skill:  SkillName | null
  department:      string
  typical_shifts:  string[]
  avoid_shifts:    string[]
  activa:          boolean
  orden:           number
  created_at:      string
}

export type PunctionsByDay = {
  mon: number; tue: number; wed: number; thu: number
  fri: number; sat: number; sun: number
}

export type CoverageByDayEntry = { lab: number; andrology: number; admin: number }
export type CoverageByDay = {
  mon: CoverageByDayEntry; tue: CoverageByDayEntry; wed: CoverageByDayEntry
  thu: CoverageByDayEntry; fri: CoverageByDayEntry; sat: CoverageByDayEntry
  sun: CoverageByDayEntry
}
// Per-shift per-department coverage: { shift_code: { day_code: { dept_code: N, ... } } }
// Fixed keys for by_shift mode; index signature allows arbitrary dept codes (by_task with dept linking)
// Backward-compat: values can be plain numbers (treated as lab-only, legacy)
export type ShiftCoverageEntry = { lab: number; andrology: number; admin: number; [deptCode: string]: number }
export type ShiftCoverageByDay = Record<string, Record<string, ShiftCoverageEntry | number>>

export interface LabConfig {
  id:                       string
  organisation_id:          string
  min_lab_coverage:         number
  min_andrology_coverage:   number
  min_weekend_andrology:    number
  min_weekend_lab_coverage: number
  coverage_by_day:          CoverageByDay | null
  punctions_average:        number   // legacy — superseded by punctions_by_day
  punctions_by_day:         PunctionsByDay
  staffing_ratio:           number
  admin_on_weekends:        boolean
  admin_default_shift:      string | null
  autonomous_community:     string | null
  ratio_optimal:            number
  ratio_minimum:            number
  first_day_of_week:        number  // 0=Mon, 5=Sat, 6=Sun
  country:                  string
  region:                   string
  time_format:              string  // "24h" | "12h"
  biopsy_conversion_rate:   number  // 0-1, default 0.5
  biopsy_day5_pct:          number  // 0-1, default 0.5
  biopsy_day6_pct:          number  // 0-1, default 0.5
  task_conflict_threshold:  number  // minimum 2, default 3
  task_coverage_enabled:    boolean // whether per-task coverage minimums are active (by_task mode)
  task_coverage_by_day:     Record<string, Record<string, number>> | null // tecnica_code → { mon: N, tue: N, ... }
  shift_coverage_enabled:   boolean // whether per-shift coverage minimums are active (by_shift mode)
  shift_coverage_by_day:    ShiftCoverageByDay | null // shift_code → { day: { lab: N, andrology: N, admin: N } }
  shift_rotation:           "stable" | "weekly" | "daily"  // default "stable"
  enable_leave_requests:    boolean
  enable_swap_requests:     boolean  // allow staff to request shift swaps on published rotas
  enable_task_in_shift:     boolean  // show task assignment in by_shift mode
  enable_outlook_sync:      boolean
  enable_notes:             boolean
  days_off_preference:      "always_weekend" | "prefer_weekend" | "any_day" | "guardia"  // default "prefer_weekend"
  guardia_min_weeks_between: number  // default 2 — min full weeks between two guardias for same person
  guardia_max_per_month:     number  // default 2 — hard cap per person per calendar month (0 = no cap)
  public_holiday_mode:      "weekday" | "saturday" | "sunday"  // default "saturday" — which day's coverage to use on holidays
  public_holiday_reduce_budget: boolean  // default true — reduce weekly budget by 1 per holiday
  annual_leave_days:        number  // default 20 — annual holiday allowance per employee
  default_days_per_week:    number  // default 5 — default working days per week for new staff + headcount calc
  part_time_weight:         number  // default 0.5 — coverage fraction for part-time staff
  intern_weight:            number  // default 0.5 — coverage fraction for intern staff
  shift_name_am_es:         string
  shift_name_pm_es:         string
  shift_name_full_es:       string
  shift_name_am_en:         string
  shift_name_pm_en:         string
  shift_name_full_en:       string
  shift_am_start:           string
  shift_am_end:             string
  shift_pm_start:           string
  shift_pm_end:             string
  shift_full_start:         string
  shift_full_end:           string
  created_at:               string
  updated_at:               string
}

// ── Outlook Connections ──────────────────────────────────────────────────────
export interface OutlookConnection {
  id:                string
  organisation_id:   string
  staff_id:          string
  microsoft_user_id: string
  email:             string
  access_token:      string   // encrypted at app layer
  refresh_token:     string   // encrypted at app layer
  token_expires_at:  string
  last_synced_at:    string | null
  sync_enabled:      boolean
  created_at:        string
  updated_at:        string
}

// ── Swap Requests ────────────────────────────────────────────────────────────

export type SwapType   = 'shift_swap' | 'day_off'
export type SwapStatus = 'pending_manager' | 'manager_approved' | 'pending_target' | 'approved' | 'rejected' | 'cancelled'

export interface SwapRequest {
  id:                      string
  organisation_id:         string
  rota_id:                 string
  initiator_staff_id:      string
  initiator_assignment_id: string
  swap_type:               SwapType
  target_staff_id:         string | null
  target_assignment_id:    string | null
  swap_date:               string
  swap_shift_type:         string
  status:                  SwapStatus
  rejected_by:             string | null
  rejection_reason:        string | null
  manager_reviewed_at:     string | null
  manager_reviewed_by:     string | null
  target_responded_at:     string | null
  created_at:              string
  updated_at:              string
}

// ── HR Module types ──────────────────────────────────────────────────────────

export type HrModuleStatus = 'active' | 'inactive'
export type CountingMethod = 'working_days' | 'calendar_days'

export interface HrModule {
  id:              string
  organisation_id: string
  status:          HrModuleStatus
  installed_at:    string
  installed_by:    string | null
  removed_at:      string | null
  removed_by:      string | null
  created_at:      string
  updated_at:      string
}

export interface CompanyLeaveType {
  id:                    string
  organisation_id:       string
  name:                  string
  name_en:               string | null
  has_balance:           boolean
  default_days:          number | null
  allows_carry_forward:  boolean
  overflow_to_type_id:   string | null
  is_paid:               boolean
  color:                 string
  is_archived:           boolean
  sort_order:            number
  created_at:            string
  updated_at:            string
}

export interface HolidayConfig {
  id:                          string
  organisation_id:             string
  leave_year_start_month:      number
  leave_year_start_day:        number
  counting_method:             CountingMethod
  public_holidays_deducted:    boolean
  carry_forward_allowed:       boolean
  max_carry_forward_days:      number
  carry_forward_expiry_month:  number
  carry_forward_expiry_day:    number
  created_at:                  string
  updated_at:                  string
}

export interface HolidayBalance {
  id:                      string
  organisation_id:         string
  staff_id:                string
  leave_type_id:           string
  year:                    number
  entitlement:             number
  carried_forward:         number
  cf_expiry_date:          string | null
  manual_adjustment:       number
  manual_adjustment_notes: string | null
  created_at:              string
  updated_at:              string
}

export type CompanyLeaveTypeInsert = Omit<CompanyLeaveType, 'id' | 'created_at' | 'updated_at'>
export type CompanyLeaveTypeUpdate = Partial<Omit<CompanyLeaveTypeInsert, 'organisation_id'>>
export type HolidayBalanceInsert = Omit<HolidayBalance, 'id' | 'created_at' | 'updated_at'>
export type HolidayBalanceUpdate = Partial<Omit<HolidayBalanceInsert, 'organisation_id'>>

// ── Audit Logs ───────────────────────────────────────────────────────────────
export interface AuditLog {
  id:              string
  organisation_id: string | null
  user_id:         string | null
  user_email:      string | null
  action:          string
  entity_type:     string | null
  entity_id:       string | null
  changes:         Record<string, unknown> | null
  metadata:        Record<string, unknown> | null
  created_at:      string
}

// ── Backups ──────────────────────────────────────────────────────────────────
export type BackupType = 'auto' | 'manual'

export interface Backup {
  id:              string
  organisation_id: string
  created_at:      string
  created_by:      string | null
  type:            BackupType
  label:           string | null
  config:          Record<string, unknown>
  rotas:           unknown[]
}

// ── Implementation Steps ─────────────────────────────────────────────────────
export interface ImplementationStep {
  id:              string
  organisation_id: string
  step_key:        string
  completed_at:    string
  completed_by:    string | null
}

// ── Rota Snapshots ───────────────────────────────────────────────────────────
export interface RotaSnapshotRow {
  id:              string
  organisation_id: string
  rota_id:         string
  date:            string
  week_start:      string
  assignments:     unknown
  user_id:         string | null
  user_email:      string | null
  created_at:      string
}

// ── Hybrid Generation Log ────────────────────────────────────────────────────
export interface HybridGenerationLog {
  id:              string
  organisation_id: string
  created_at:      string
}

// ── Insert types (required fields + optional DB-default fields) ──────────────

export type StaffInsert = Pick<Staff, 'organisation_id' | 'first_name' | 'last_name' | 'role' | 'working_pattern' | 'contracted_hours' | 'days_per_week' | 'start_date' | 'color'> & Partial<Pick<Staff,
  | 'email' | 'preferred_days' | 'avoid_days' | 'onboarding_status' | 'contract_type'
  | 'onboarding_end_date' | 'prefers_guardia' | 'preferred_shift' | 'avoid_shifts'
  | 'end_date' | 'notes'
>>

export type LeaveInsert = Pick<Leave, 'organisation_id' | 'staff_id' | 'type' | 'start_date' | 'end_date' | 'status'> & Partial<Pick<Leave,
  | 'source' | 'outlook_event_id' | 'notes' | 'attachment_url'
  | 'created_by' | 'reviewed_by' | 'reviewed_at'
  | 'leave_type_id' | 'days_counted' | 'balance_year'
  | 'uses_cf_days' | 'cf_days_used' | 'parent_leave_id'
>>

export type RotaInsert = Pick<Rota, 'organisation_id' | 'week_start'> & Partial<Pick<Rota,
  | 'status' | 'generation_type' | 'published_at' | 'published_by' | 'punctions_override' | 'engine_warnings'
>>

export type RotaAssignmentInsert = Pick<RotaAssignment, 'organisation_id' | 'rota_id' | 'staff_id' | 'date' | 'shift_type'> & Partial<Pick<RotaAssignment,
  | 'function_label' | 'is_manual_override' | 'trainee_staff_id' | 'notes'
  | 'is_opu' | 'tecnica_id' | 'whole_team'
>>

export type SwapRequestInsert = Pick<SwapRequest, 'organisation_id' | 'rota_id' | 'initiator_staff_id' | 'initiator_assignment_id' | 'swap_type' | 'swap_date' | 'swap_shift_type' | 'status'> & Partial<Pick<SwapRequest,
  | 'target_staff_id' | 'target_assignment_id' | 'rejected_by' | 'rejection_reason'
  | 'manager_reviewed_at' | 'manager_reviewed_by' | 'target_responded_at'
>>

// ── Update types (all fields optional except id) ──────────────────────────────
export type StaffUpdate  = Partial<StaffInsert>
export type LeaveUpdate  = Partial<LeaveInsert>
export type LabConfigUpdate = {
  min_lab_coverage?:         number
  min_andrology_coverage?:   number
  min_weekend_andrology?:    number
  min_weekend_lab_coverage?: number
  coverage_by_day?:          CoverageByDay
  punctions_by_day?:         PunctionsByDay
  staffing_ratio?:           number
  admin_on_weekends?:        boolean
  admin_default_shift?:      string | null
  autonomous_community?:     string | null
  ratio_optimal?:            number
  ratio_minimum?:            number
  first_day_of_week?:        number
  country?:                  string
  region?:                   string
  time_format?:              string
  biopsy_conversion_rate?:   number
  biopsy_day5_pct?:          number
  biopsy_day6_pct?:          number
  task_conflict_threshold?:  number
  shift_rotation?:           "stable" | "weekly" | "daily"
  enable_outlook_sync?:      boolean
  enable_notes?:             boolean
  enable_task_in_shift?:     boolean
  enable_leave_requests?:    boolean
  enable_swap_requests?:     boolean
  default_days_per_week?:    number
  shift_name_am_es?:         string
  shift_name_pm_es?:         string
  shift_name_full_es?:       string
  shift_name_am_en?:         string
  shift_name_pm_en?:         string
  shift_name_full_en?:       string
  shift_am_start?:           string
  shift_am_end?:             string
  shift_pm_start?:           string
  shift_pm_end?:             string
  shift_full_start?:         string
  shift_full_end?:           string
  days_off_preference?:       "always_weekend" | "prefer_weekend" | "any_day" | "guardia"
  guardia_min_weeks_between?: number
  guardia_max_per_month?:     number
  public_holiday_mode?:      "weekday" | "saturday" | "sunday"
  public_holiday_reduce_budget?: boolean
  annual_leave_days?:        number
  part_time_weight?:         number
  intern_weight?:            number
  task_coverage_enabled?:    boolean
  task_coverage_by_day?:     Record<string, Record<string, number>> | null
  shift_coverage_enabled?:   boolean
  shift_coverage_by_day?:    ShiftCoverageByDay | null
}

// ── Rota Rules ────────────────────────────────────────────────────────────────

export type RotaRuleType =
  | 'no_coincidir'
  | 'supervisor_requerido'
  | 'max_dias_consecutivos'
  | 'distribucion_fines_semana'
  | 'descanso_fin_de_semana'
  | 'no_misma_tarea'
  | 'no_librar_mismo_dia'
  | 'restriccion_dia_tecnica'
  | 'asignacion_fija'
  | 'tecnicas_juntas'
  | 'tarea_multidepartamento'
  | 'equipo_completo'

export interface RotaRule {
  id:              string
  organisation_id: string
  type:            RotaRuleType
  is_hard:         boolean
  enabled:         boolean
  staff_ids:       string[]
  params:          Record<string, unknown>
  notes:           string | null
  expires_at:      string | null
  created_at:      string
  updated_at:      string
}

export type RotaRuleInsert = Pick<RotaRule, 'organisation_id' | 'type' | 'is_hard' | 'enabled' | 'staff_ids' | 'params'> & Partial<Pick<RotaRule, 'notes' | 'expires_at'>>
export type RotaRuleUpdate = Partial<RotaRuleInsert>

// ── Rota Templates ───────────────────────────────────────────────────────────

export interface RotaTemplateAssignment {
  staff_id:       string
  day_offset:     number  // 0=Mon, 1=Tue, ..., 6=Sun
  shift_type:     string
  function_label: string | null
}

export interface RotaTemplate {
  id:              string
  organisation_id: string
  name:            string
  assignments:     RotaTemplateAssignment[]
  created_at:      string
  updated_at:      string
}

// ── Rota publish recipients ───────────────────────────────────────────────────
export interface RotaPublishRecipient {
  id:              string
  organisation_id: string
  user_id:         string | null
  external_email:  string | null
  external_name:   string | null
  enabled:         boolean
  created_at:      string
}

// ── Notifications ─────────────────────────────────────────────────────────────
export interface Notification {
  id:              string
  organisation_id: string
  user_id:         string
  type:            string
  title:           string
  message:         string
  data:            Record<string, unknown>
  read:            boolean
  created_at:      string
}

// ── Organisation Members ──────────────────────────────────────────────────────
export interface OrganisationMember {
  id:              string
  organisation_id: string
  user_id:         string
  display_name:    string | null
  role:            string
  linked_staff_id: string | null
  created_at:      string
}

// ── Joined types used in UI ───────────────────────────────────────────────────
export type StaffWithSkills = Staff & {
  staff_skills: StaffSkill[]
}

export type RotaAssignmentWithStaff = RotaAssignment & {
  staff: Staff
}

export type LeaveWithStaff = Leave & {
  staff: Pick<Staff, 'id' | 'first_name' | 'last_name' | 'role'> | null
  reviewer_name?: string | null
}

// ── Supabase Database type (for typed createClient<Database>()) ───────────────
// Flatten converts interfaces to mapped types so supabase-js conditional types resolve correctly.
// Without this, postgrest-js generics fall back to `never` for insert/update operations.
type Flatten<T> = { [K in keyof T]: T[K] }
export interface Database {
  public: {
    Tables: {
      organisations: {
        Row:    Flatten<Organisation>
        Insert: { name: string; slug: string; is_active?: boolean }
        Update: Flatten<Partial<Omit<Organisation, 'id' | 'created_at'>>>
        Relationships: []
      }
      profiles: {
        Row:    Flatten<Profile>
        Insert: { id: string; email: string; organisation_id?: string | null; default_organisation_id?: string | null; full_name?: string | null; preferences?: Record<string, unknown> | null }
        Update: { organisation_id?: string | null; default_organisation_id?: string | null; full_name?: string | null; preferences?: Record<string, unknown> | null }
        Relationships: []
      }
      staff: {
        Row:    Flatten<Staff>
        Insert: Flatten<StaffInsert>
        Update: Flatten<StaffUpdate>
        Relationships: []
      }
      staff_skills: {
        Row:    Flatten<StaffSkill>
        Insert: { organisation_id: string; staff_id: string; skill: string; level?: string }
        Update: Record<string, never>
        Relationships: []
      }
      leaves: {
        Row:    Flatten<Leave>
        Insert: Flatten<LeaveInsert>
        Update: Flatten<LeaveUpdate>
        Relationships: []
      }
      rotas: {
        Row:    Flatten<Rota>
        Insert: Flatten<RotaInsert>
        Update: Flatten<Partial<RotaInsert>>
        Relationships: []
      }
      rota_assignments: {
        Row:    Flatten<RotaAssignment>
        Insert: Flatten<RotaAssignmentInsert>
        Update: Flatten<Partial<RotaAssignmentInsert>>
        Relationships: []
      }
      lab_config: {
        Row:    Flatten<LabConfig>
        Insert: Flatten<Pick<LabConfig, 'organisation_id'> & Partial<Omit<LabConfig, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>>>
        Update: Flatten<LabConfigUpdate>
        Relationships: []
      }
      rota_rules: {
        Row:    Flatten<RotaRule>
        Insert: Flatten<RotaRuleInsert>
        Update: Flatten<RotaRuleUpdate>
        Relationships: []
      }
      shift_types: {
        Row:    Flatten<ShiftTypeDefinition>
        Insert: Flatten<Pick<ShiftTypeDefinition, 'organisation_id' | 'code' | 'name_es' | 'name_en' | 'start_time' | 'end_time' | 'sort_order' | 'active'> & Partial<Pick<ShiftTypeDefinition, 'active_days' | 'department_codes'>>>
        Update: Flatten<Partial<Omit<ShiftTypeDefinition, 'id' | 'created_at' | 'organisation_id'>>>
        Relationships: []
      }
      rota_templates: {
        Row:    Flatten<RotaTemplate>
        Insert: { organisation_id: string; name: string; assignments: unknown }
        Update: { name?: string; assignments?: unknown }
        Relationships: []
      }
      departments: {
        Row:    Flatten<Department>
        Insert: { organisation_id: string; code: string; name: string; name_en?: string; abbreviation?: string; colour?: string; is_default?: boolean; sort_order?: number }
        Update: { name?: string; name_en?: string; abbreviation?: string; colour?: string; sort_order?: number }
        Relationships: []
      }
      outlook_connections: {
        Row:    Flatten<OutlookConnection>
        Insert: { organisation_id: string; staff_id: string; microsoft_user_id: string; email: string; access_token: string; refresh_token: string; token_expires_at: string; sync_enabled?: boolean }
        Update: { access_token?: string; refresh_token?: string; token_expires_at?: string; last_synced_at?: string; sync_enabled?: boolean }
        Relationships: []
      }
      organisation_members: {
        Row:    Flatten<OrganisationMember>
        Insert: { organisation_id: string; user_id: string; role?: string; display_name?: string | null; linked_staff_id?: string | null }
        Update: { role?: string; display_name?: string | null; linked_staff_id?: string | null }
        Relationships: []
      }
      hr_module: {
        Row:    Flatten<HrModule>
        Insert: { organisation_id: string; status?: HrModuleStatus; installed_by?: string | null }
        Update: { status?: HrModuleStatus; removed_at?: string | null; removed_by?: string | null }
        Relationships: []
      }
      company_leave_types: {
        Row:    Flatten<CompanyLeaveType>
        Insert: Flatten<CompanyLeaveTypeInsert>
        Update: Flatten<CompanyLeaveTypeUpdate>
        Relationships: []
      }
      holiday_config: {
        Row:    Flatten<HolidayConfig>
        Insert: Flatten<{ organisation_id: string } & Partial<Omit<HolidayConfig, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>>>
        Update: Flatten<Partial<Omit<HolidayConfig, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>>>
        Relationships: []
      }
      holiday_balance: {
        Row:    Flatten<HolidayBalance>
        Insert: Flatten<HolidayBalanceInsert>
        Update: Flatten<HolidayBalanceUpdate>
        Relationships: []
      }
      tecnicas: {
        Row:    Flatten<Tecnica>
        Insert: Flatten<Pick<Tecnica, 'organisation_id' | 'nombre_es' | 'nombre_en' | 'codigo' | 'color' | 'department' | 'activa' | 'orden'> & Partial<Pick<Tecnica, 'required_skill' | 'typical_shifts' | 'avoid_shifts'>>>
        Update: Flatten<Partial<Omit<Tecnica, 'id' | 'created_at' | 'organisation_id'>>>
        Relationships: []
      }
      notifications: {
        Row:    Flatten<Notification>
        Insert: { organisation_id: string; user_id: string; type?: string; title: string; message?: string; data?: Record<string, unknown>; read?: boolean }
        Update: { read?: boolean }
        Relationships: []
      }
      swap_requests: {
        Row:    Flatten<SwapRequest>
        Insert: Flatten<SwapRequestInsert>
        Update: Flatten<Partial<SwapRequestInsert>>
        Relationships: []
      }
      rota_publish_recipients: {
        Row:    Flatten<RotaPublishRecipient>
        Insert: { organisation_id: string; user_id?: string | null; external_email?: string | null; external_name?: string | null; enabled?: boolean }
        Update: { user_id?: string | null; external_email?: string | null; external_name?: string | null; enabled?: boolean }
        Relationships: []
      }
      audit_logs: {
        Row:    Flatten<AuditLog>
        Insert: { organisation_id?: string | null; user_id?: string | null; user_email?: string | null; action: string; entity_type?: string | null; entity_id?: string | null; changes?: Record<string, unknown> | null; metadata?: Record<string, unknown> | null }
        Update: Record<string, never>
        Relationships: []
      }
      backups: {
        Row:    Flatten<Backup>
        Insert: { organisation_id: string; created_by?: string | null; type: BackupType; label?: string | null; config?: Record<string, unknown>; rotas?: unknown[] }
        Update: { label?: string | null; rotas?: unknown[] }
        Relationships: []
      }
      implementation_steps: {
        Row:    Flatten<ImplementationStep>
        Insert: { organisation_id: string; step_key: string; completed_by?: string | null }
        Update: Record<string, never>
        Relationships: []
      }
      rota_snapshots: {
        Row:    Flatten<RotaSnapshotRow>
        Insert: { organisation_id: string; rota_id: string; date: string; week_start: string; assignments: unknown; user_id?: string | null; user_email?: string | null }
        Update: Record<string, never>
        Relationships: []
      }
      hybrid_generation_log: {
        Row:    Flatten<HybridGenerationLog>
        Insert: { organisation_id: string }
        Update: Record<string, never>
        Relationships: []
      }
      note_templates: {
        Row:    { id: string; organisation_id: string; text: string; created_at: string; updated_at: string }
        Insert: { organisation_id: string; text: string }
        Update: { text?: string; updated_at?: string }
        Relationships: []
      }
      week_notes: {
        Row:    { id: string; organisation_id: string; week_start: string; text: string; is_template: boolean; created_at: string; updated_at: string }
        Insert: { organisation_id: string; week_start: string; text: string; is_template?: boolean }
        Update: { text?: string; updated_at?: string }
        Relationships: []
      }
      dismissed_note_templates: {
        Row:    { id: string; organisation_id: string; note_template_id: string; week_start: string; created_at: string }
        Insert: { organisation_id: string; note_template_id: string; week_start: string }
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Enums: {
      staff_role:        StaffRole
      onboarding_status: OnboardingStatus
      rota_status:       RotaStatus
      leave_type:        LeaveType
      leave_status:      LeaveStatus
      skill_name:        SkillName
    }
    Functions: {
      auth_organisation_id: {
        Args:    Record<string, never>
        Returns: string
      }
    }
    CompositeTypes: Record<string, never>
  }
}
