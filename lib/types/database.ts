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
export type ShiftType         = string
export type RotaStatus        = 'draft' | 'published'
export type LeaveType         = 'annual' | 'sick' | 'personal' | 'training' | 'maternity' | 'other'
export type LeaveStatus       = 'pending' | 'approved' | 'rejected'
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
  created_at:      string
}
export type WorkingDay        = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WorkingPattern    = WorkingDay[]

// ── Row types (what you get back from SELECT) ─────────────────────────────────
export type RotaDisplayMode = 'by_shift' | 'by_task'

export interface Organisation {
  id:                 string
  name:               string
  slug:               string
  is_active:          boolean
  logo_url:           string | null
  rota_display_mode:  RotaDisplayMode
  created_at:         string
}

export interface Profile {
  id:              string
  organisation_id: string | null
  email:           string
  full_name:       string | null
  created_at:      string
  updated_at:      string
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
  contracted_hours:  number
  days_per_week:     number
  onboarding_status: OnboardingStatus
  preferred_shift:   ShiftType | null
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

export interface Leave {
  id:              string
  organisation_id: string
  staff_id:        string
  type:            LeaveType
  start_date:      string
  end_date:        string
  status:          LeaveStatus
  notes:           string | null
  created_by:      string | null
  created_at:      string
  updated_at:      string
}

export type GenerationType = 'strict_template' | 'flexible_template' | 'ai_optimal' | 'manual'

export interface Rota {
  id:                 string
  organisation_id:    string
  week_start:         string   // ISO date string — always a Monday
  status:             RotaStatus
  generation_type:    GenerationType | null
  published_at:       string | null
  published_by:       string | null
  punctions_override: Record<string, number> | null
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
  department:      'lab' | 'andrology'
  typical_shifts:  string[]
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
  shift_rotation:           "stable" | "weekly" | "daily"  // default "stable"
  enable_notes:             boolean
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

// ── Insert types (omit server-generated fields) ───────────────────────────────
export type StaffInsert = Omit<Staff, 'id' | 'created_at' | 'updated_at'>
export type LeaveInsert = Omit<Leave, 'id' | 'created_at' | 'updated_at'>
export type RotaInsert  = Omit<Rota,  'id' | 'created_at' | 'updated_at'>
export type RotaAssignmentInsert = Omit<RotaAssignment, 'id' | 'created_at' | 'updated_at'>

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
  enable_notes?:             boolean
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
}

// ── Rota Rules ────────────────────────────────────────────────────────────────

export type RotaRuleType =
  | 'no_coincidir'
  | 'supervisor_requerido'
  | 'max_dias_consecutivos'
  | 'distribucion_fines_semana'
  | 'no_turno_doble'

export interface RotaRule {
  id:              string
  organisation_id: string
  type:            RotaRuleType
  is_hard:         boolean
  enabled:         boolean
  staff_ids:       string[]
  params:          Record<string, unknown>
  notes:           string | null
  created_at:      string
  updated_at:      string
}

export type RotaRuleInsert = Omit<RotaRule, 'id' | 'created_at' | 'updated_at'>
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
  created_at:      string
}

// ── Joined types used in UI ───────────────────────────────────────────────────
export interface StaffWithSkills extends Staff {
  staff_skills: StaffSkill[]
}

export interface RotaAssignmentWithStaff extends RotaAssignment {
  staff: Staff
}

export interface LeaveWithStaff extends Leave {
  staff: Pick<Staff, 'id' | 'first_name' | 'last_name' | 'role'>
}

// ── Supabase Database type (for typed createClient<Database>()) ───────────────
// Use explicit Insert/Update shapes (not Omit<>) so supabase-js generics resolve correctly.
export interface Database {
  public: {
    Tables: {
      organisations: {
        Row:    Organisation
        Insert: { name: string; slug: string; is_active?: boolean }
        Update: { name?: string; slug?: string; is_active?: boolean; logo_url?: string | null }
        Relationships: []
      }
      profiles: {
        Row:    Profile
        Insert: { id: string; email: string; organisation_id?: string | null; full_name?: string | null }
        Update: { organisation_id?: string | null; full_name?: string | null }
        Relationships: []
      }
      staff: {
        Row:    Staff
        Insert: StaffInsert
        Update: StaffUpdate
        Relationships: []
      }
      staff_skills: {
        Row:    StaffSkill
        Insert: { organisation_id: string; staff_id: string; skill: SkillName; level?: SkillLevel }
        Update: Record<string, never>
        Relationships: []
      }
      leaves: {
        Row:    Leave
        Insert: LeaveInsert
        Update: LeaveUpdate
        Relationships: []
      }
      rotas: {
        Row:    Rota
        Insert: RotaInsert
        Update: Partial<RotaInsert>
        Relationships: []
      }
      rota_assignments: {
        Row:    RotaAssignment
        Insert: RotaAssignmentInsert
        Update: Partial<RotaAssignmentInsert>
        Relationships: []
      }
      lab_config: {
        Row:    LabConfig
        Insert: { organisation_id: string } & Partial<Omit<LabConfig, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>>
        Update: LabConfigUpdate
        Relationships: []
      }
      rota_rules: {
        Row:    RotaRule
        Insert: RotaRuleInsert
        Update: RotaRuleUpdate
        Relationships: []
      }
      shift_types: {
        Row:    ShiftTypeDefinition
        Insert: Omit<ShiftTypeDefinition, 'id' | 'created_at'>
        Update: Partial<Omit<ShiftTypeDefinition, 'id' | 'created_at' | 'organisation_id'>>
        Relationships: []
      }
      rota_templates: {
        Row:    RotaTemplate
        Insert: { organisation_id: string; name: string; assignments: unknown }
        Update: { name?: string; assignments?: unknown }
        Relationships: []
      }
      departments: {
        Row:    Department
        Insert: { organisation_id: string; code: string; name: string; name_en?: string; abbreviation?: string; colour?: string; is_default?: boolean; sort_order?: number }
        Update: { name?: string; name_en?: string; abbreviation?: string; colour?: string; sort_order?: number }
        Relationships: []
      }
      organisation_members: {
        Row:    OrganisationMember
        Insert: { organisation_id: string; user_id: string; role?: string; display_name?: string | null }
        Update: { role?: string; display_name?: string | null }
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
