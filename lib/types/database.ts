// ============================================================
// LabRota — Database types
// Keep in sync with supabase/migrations/20260317000001_initial_schema.sql
// ============================================================

// ── Enums ────────────────────────────────────────────────────────────────────
export type StaffRole         = 'lab' | 'andrology' | 'admin'
export type OnboardingStatus  = 'active' | 'onboarding' | 'inactive'
export type ShiftType         = 'am' | 'pm' | 'full'
export type RotaStatus        = 'draft' | 'published'
export type LeaveType         = 'annual' | 'sick' | 'personal' | 'other'
export type LeaveStatus       = 'pending' | 'approved' | 'rejected'
export type SkillName         =
  | 'icsi' | 'iui' | 'vitrification' | 'thawing'
  | 'biopsy' | 'semen_analysis' | 'sperm_prep' | 'witnessing' | 'other'

export type WorkingDay        = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WorkingPattern    = WorkingDay[]

// ── Row types (what you get back from SELECT) ─────────────────────────────────
export interface Organisation {
  id:         string
  name:       string
  slug:       string
  is_active:  boolean
  created_at: string
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
  contracted_hours:  number
  onboarding_status: OnboardingStatus
  start_date:        string
  end_date:          string | null
  notes:             string | null
  created_at:        string
  updated_at:        string
}

export interface StaffSkill {
  id:              string
  organisation_id: string
  staff_id:        string
  skill:           SkillName
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

export interface Rota {
  id:              string
  organisation_id: string
  week_start:      string   // ISO date string — always a Monday
  status:          RotaStatus
  published_at:    string | null
  published_by:    string | null
  created_at:      string
  updated_at:      string
}

export interface RotaAssignment {
  id:                 string
  organisation_id:    string
  rota_id:            string
  staff_id:           string
  date:               string
  shift_type:         ShiftType
  is_manual_override: boolean
  created_at:         string
  updated_at:         string
}

export interface LabConfig {
  id:                     string
  organisation_id:        string
  min_lab_coverage:       number
  min_andrology_coverage: number
  min_weekend_andrology:  number
  punctions_average:      number
  staffing_ratio:         number
  admin_on_weekends:      boolean
  created_at:             string
  updated_at:             string
}

// ── Insert types (omit server-generated fields) ───────────────────────────────
export type StaffInsert = Omit<Staff, 'id' | 'created_at' | 'updated_at'>
export type LeaveInsert = Omit<Leave, 'id' | 'created_at' | 'updated_at'>
export type RotaInsert  = Omit<Rota,  'id' | 'created_at' | 'updated_at'>
export type RotaAssignmentInsert = Omit<RotaAssignment, 'id' | 'created_at' | 'updated_at'>

// ── Update types (all fields optional except id) ──────────────────────────────
export type StaffUpdate  = Partial<StaffInsert>
export type LeaveUpdate  = Partial<LeaveInsert>
export type LabConfigUpdate = { min_lab_coverage?: number; min_andrology_coverage?: number; min_weekend_andrology?: number; punctions_average?: number; staffing_ratio?: number; admin_on_weekends?: boolean }

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
        Update: { name?: string; slug?: string; is_active?: boolean }
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
        Insert: { organisation_id: string; staff_id: string; skill: SkillName }
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
        Insert: { organisation_id: string; min_lab_coverage?: number; min_andrology_coverage?: number; min_weekend_andrology?: number; punctions_average?: number; staffing_ratio?: number; admin_on_weekends?: boolean }
        Update: { min_lab_coverage?: number; min_andrology_coverage?: number; min_weekend_andrology?: number; punctions_average?: number; staffing_ratio?: number; admin_on_weekends?: boolean }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Enums: {
      staff_role:        StaffRole
      onboarding_status: OnboardingStatus
      shift_type:        ShiftType
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
