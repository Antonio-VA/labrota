import { describe, it, expect } from "vitest"
import { runTaskEngine } from "../task-engine"
import type {
  StaffWithSkills,
  LabConfig,
  ShiftTypeDefinition,
  RotaRule,
} from "../types/database"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG = "org-1"
const WEEK = "2026-03-16" // Mon 16 Mar – Sun 22 Mar

const SHIFT_T1: ShiftTypeDefinition = {
  id: "s1", organisation_id: ORG, code: "T1", name_es: "Mañana", name_en: "Morning",
  start_time: "08:00", end_time: "15:00", sort_order: 1, created_at: "",
  active: true, active_days: [], department_codes: [],
}

const BASE_CONFIG = {
  id: "cfg-1",
  organisation_id: ORG,
  min_lab_coverage: 2,
  min_andrology_coverage: 1,
  staffing_ratio: 3,
  punctions_by_day: {},
  coverage_by_day: {
    mon: { lab: 2, andrology: 1, admin: 0 },
    tue: { lab: 2, andrology: 1, admin: 0 },
    wed: { lab: 2, andrology: 1, admin: 0 },
    thu: { lab: 2, andrology: 1, admin: 0 },
    fri: { lab: 2, andrology: 1, admin: 0 },
    sat: { lab: 0, andrology: 0, admin: 0 },
    sun: { lab: 0, andrology: 0, admin: 0 },
  },
  task_conflict_threshold: 3,
  created_at: "",
  updated_at: "",
} as unknown as LabConfig

function makeStaff(overrides: Partial<StaffWithSkills> & { id: string }): StaffWithSkills {
  return {
    organisation_id: ORG,
    first_name: overrides.id,
    last_name: "Test",
    email: null,
    role: "lab",
    working_pattern: ["mon", "tue", "wed", "thu", "fri"],
    preferred_days: null,
    avoid_days: null,
    avoid_shifts: null,
    contracted_hours: 40,
    days_per_week: 5,
    onboarding_status: "active",
    preferred_shift: null,
    start_date: "2020-01-01",
    end_date: null,
    notes: null,
    created_at: "",
    updated_at: "",
    staff_skills: [],
    ...overrides,
  } as StaffWithSkills
}

const TECNICAS = [
  { codigo: "OPU", department: "lab", typical_shifts: [], avoid_shifts: [] },
  { codigo: "ICSI", department: "lab", typical_shifts: [], avoid_shifts: [] },
  { codigo: "BIO", department: "lab", typical_shifts: [], avoid_shifts: [] },
  { codigo: "SEMEN", department: "andrology", typical_shifts: [], avoid_shifts: [] },
]

// ── Basic assignment tests ───────────────────────────────────────────────────

describe("runTaskEngine", () => {
  it("assigns staff to tasks based on skills", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk2", organisation_id: ORG, staff_id: "s1", skill: "ICSI", level: "certified", created_at: "" },
      ]}),
      makeStaff({ id: "s2", role: "lab", staff_skills: [
        { id: "sk3", organisation_id: ORG, staff_id: "s2", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk4", organisation_id: ORG, staff_id: "s2", skill: "BIO", level: "certified", created_at: "" },
      ]}),
      makeStaff({ id: "s3", role: "andrology", staff_skills: [
        { id: "sk5", organisation_id: ORG, staff_id: "s3", skill: "SEMEN", level: "certified", created_at: "" },
      ]}),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: TECNICAS,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU:   { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
        ICSI:  { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
        SEMEN: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
    })

    expect(result.days).toHaveLength(7)

    // Monday through Friday should have assignments
    const monday = result.days[0]
    expect(monday.date).toBe("2026-03-16")
    expect(monday.assignments.length).toBeGreaterThanOrEqual(3) // OPU + ICSI + SEMEN

    // Each assignment should have a function_label
    for (const a of monday.assignments) {
      expect(a.function_label).toBeTruthy()
      expect(a.shift_type).toBe("T1") // dummy shift
    }

    // Weekend should have no assignments (coverage is 0)
    const saturday = result.days[5]
    expect(saturday.assignments).toHaveLength(0)
  })

  it("warns when no qualified staff for a task", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
      ]}),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: TECNICAS,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU:  { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
        ICSI: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
    })

    // ICSI should generate a coverage warning since s1 can't do it
    const icsiWarnings = result.warnings.filter((w) => w.includes("ICSI") && w.includes("COBERTURA"))
    expect(icsiWarnings.length).toBeGreaterThan(0)
  })

  it("respects staff leave", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
      ]}),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [{ staff_id: "s1", start_date: "2026-03-16", end_date: "2026-03-16", type: "holiday", status: "approved" } as any],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: TECNICAS,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
    })

    // Monday: s1 on leave, should not be assigned
    const monday = result.days[0]
    expect(monday.assignments.filter((a) => a.staff_id === "s1")).toHaveLength(0)

    // Tuesday: s1 should be assigned
    const tuesday = result.days[1]
    expect(tuesday.assignments.filter((a) => a.staff_id === "s1")).toHaveLength(1)
  })

  it("respects days_per_week budget", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", days_per_week: 3, staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
      ]}),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: TECNICAS,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
    })

    // s1 should only work 3 days
    const daysWorked = result.days.filter((d) => d.assignments.some((a) => a.staff_id === "s1")).length
    expect(daysWorked).toBe(3)
  })
})

// ── Multi-task per person ────────────────────────────────────────────────────

describe("multi-task assignment", () => {
  it("assigns one person to multiple tasks when qualified", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk2", organisation_id: ORG, staff_id: "s1", skill: "ICSI", level: "certified", created_at: "" },
        { id: "sk3", organisation_id: ORG, staff_id: "s1", skill: "BIO", level: "certified", created_at: "" },
      ]}),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: TECNICAS,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU:  { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
        ICSI: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
        BIO:  { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
    })

    const monday = result.days[0]
    const s1Tasks = monday.assignments.filter((a) => a.staff_id === "s1")
    // s1 is the only lab staff and qualified for all 3 → should get all 3
    expect(s1Tasks).toHaveLength(3)
    expect(new Set(s1Tasks.map((a) => a.function_label))).toEqual(new Set(["OPU", "ICSI", "BIO"]))
  })

  it("soft-warns when threshold exceeded but still assigns", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk2", organisation_id: ORG, staff_id: "s1", skill: "ICSI", level: "certified", created_at: "" },
        { id: "sk3", organisation_id: ORG, staff_id: "s1", skill: "BIO", level: "certified", created_at: "" },
      ]}),
    ]

    const config = { ...BASE_CONFIG, task_conflict_threshold: 2 } as unknown as LabConfig

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: config,
      shiftTypes: [SHIFT_T1],
      tecnicas: TECNICAS,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU:  { mon: 1, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
        ICSI: { mon: 1, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
        BIO:  { mon: 1, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      },
    })

    const monday = result.days[0]
    // All 3 tasks still assigned (soft threshold)
    expect(monday.assignments.filter((a) => a.staff_id === "s1")).toHaveLength(3)
    // But should have a warning about exceeding threshold
    const thresholdWarnings = result.warnings.filter((w) => w.includes("threshold"))
    expect(thresholdWarnings.length).toBeGreaterThan(0)
  })
})

// ── Fallback to department minimums ──────────────────────────────────────────

describe("fallback to department minimums", () => {
  it("distributes tasks evenly when taskCoverageEnabled is off", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk2", organisation_id: ORG, staff_id: "s1", skill: "ICSI", level: "certified", created_at: "" },
      ]}),
      makeStaff({ id: "s2", role: "lab", staff_skills: [
        { id: "sk3", organisation_id: ORG, staff_id: "s2", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk4", organisation_id: ORG, staff_id: "s2", skill: "ICSI", level: "certified", created_at: "" },
        { id: "sk5", organisation_id: ORG, staff_id: "s2", skill: "BIO", level: "certified", created_at: "" },
      ]}),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: {
        ...BASE_CONFIG,
        coverage_by_day: {
          mon: { lab: 2, andrology: 0, admin: 0 },
          tue: { lab: 2, andrology: 0, admin: 0 },
          wed: { lab: 2, andrology: 0, admin: 0 },
          thu: { lab: 2, andrology: 0, admin: 0 },
          fri: { lab: 2, andrology: 0, admin: 0 },
          sat: { lab: 0, andrology: 0, admin: 0 },
          sun: { lab: 0, andrology: 0, admin: 0 },
        },
      } as unknown as LabConfig,
      shiftTypes: [SHIFT_T1],
      tecnicas: [
        { codigo: "OPU", department: "lab", typical_shifts: [], avoid_shifts: [] },
        { codigo: "ICSI", department: "lab", typical_shifts: [], avoid_shifts: [] },
      ],
      taskCoverageEnabled: false,
    })

    const monday = result.days[0]
    // With 2 lab minimum and 2 lab tasks, each task gets 1 person
    expect(monday.assignments.length).toBeGreaterThanOrEqual(2)
    const taskCodes = new Set(monday.assignments.map((a) => a.function_label))
    expect(taskCodes).toContain("OPU")
    expect(taskCodes).toContain("ICSI")
  })
})

// ── Task rotation ────────────────────────────────────────────────────────────

describe("task rotation", () => {
  it("stable: prefers same tasks as last week", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk2", organisation_id: ORG, staff_id: "s1", skill: "ICSI", level: "certified", created_at: "" },
      ]}),
      makeStaff({ id: "s2", role: "lab", staff_skills: [
        { id: "sk3", organisation_id: ORG, staff_id: "s2", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk4", organisation_id: ORG, staff_id: "s2", skill: "ICSI", level: "certified", created_at: "" },
      ]}),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: [
        { codigo: "OPU", department: "lab", typical_shifts: [], avoid_shifts: [] },
        { codigo: "ICSI", department: "lab", typical_shifts: [], avoid_shifts: [] },
      ],
      taskRotation: "stable",
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU:  { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
        ICSI: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
      recentTaskAssignments: [
        // s1 did OPU last week, s2 did ICSI
        { staff_id: "s1", tecnica_code: "OPU", date: "2026-03-09" },
        { staff_id: "s2", tecnica_code: "ICSI", date: "2026-03-09" },
      ],
    })

    const monday = result.days[0]
    const s1Task = monday.assignments.find((a) => a.staff_id === "s1")
    const s2Task = monday.assignments.find((a) => a.staff_id === "s2")
    // Stable: s1 should prefer OPU, s2 should prefer ICSI
    expect(s1Task?.function_label).toBe("OPU")
    expect(s2Task?.function_label).toBe("ICSI")
  })

  it("weekly: prefers different tasks from last week", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk2", organisation_id: ORG, staff_id: "s1", skill: "ICSI", level: "certified", created_at: "" },
      ]}),
      makeStaff({ id: "s2", role: "lab", staff_skills: [
        { id: "sk3", organisation_id: ORG, staff_id: "s2", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk4", organisation_id: ORG, staff_id: "s2", skill: "ICSI", level: "certified", created_at: "" },
      ]}),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: [
        { codigo: "OPU", department: "lab", typical_shifts: [], avoid_shifts: [] },
        { codigo: "ICSI", department: "lab", typical_shifts: [], avoid_shifts: [] },
      ],
      taskRotation: "weekly",
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU:  { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
        ICSI: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
      recentTaskAssignments: [
        { staff_id: "s1", tecnica_code: "OPU", date: "2026-03-09" },
        { staff_id: "s2", tecnica_code: "ICSI", date: "2026-03-09" },
      ],
    })

    const monday = result.days[0]
    const s1Task = monday.assignments.find((a) => a.staff_id === "s1")
    const s2Task = monday.assignments.find((a) => a.staff_id === "s2")
    // Weekly: s1 should rotate AWAY from OPU → ICSI, s2 away from ICSI → OPU
    expect(s1Task?.function_label).toBe("ICSI")
    expect(s2Task?.function_label).toBe("OPU")
  })
})

// ── Rules ────────────────────────────────────────────────────────────────────

describe("scheduling rules", () => {
  it("max_dias_consecutivos: hard rule removes staff after N days", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
      ]}),
    ]

    // s1 worked the previous 5 days
    const recentAssignments = [
      { staff_id: "s1", date: "2026-03-11", shift_type: "T1" },
      { staff_id: "s1", date: "2026-03-12", shift_type: "T1" },
      { staff_id: "s1", date: "2026-03-13", shift_type: "T1" },
      { staff_id: "s1", date: "2026-03-14", shift_type: "T1" },
      { staff_id: "s1", date: "2026-03-15", shift_type: "T1" },
    ] as any[]

    const rules: RotaRule[] = [{
      id: "r1", organisation_id: ORG, type: "max_dias_consecutivos",
      is_hard: true, enabled: true, staff_ids: [],
      params: { maxDays: 5 }, notes: null,
      created_at: "", updated_at: "", expires_at: null,
    }]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments,
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: TECNICAS,
      rules,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
    })

    // Monday: s1 has 5 consecutive days → hard rule should remove them
    const monday = result.days[0]
    expect(monday.assignments.filter((a) => a.staff_id === "s1")).toHaveLength(0)

    // Tuesday: consecutive count resets (Mon was off) → s1 should be assignable
    // (but Mon was off because of rule, so Tue starts fresh at 0 consecutive)
    const tuesday = result.days[1]
    expect(tuesday.assignments.filter((a) => a.staff_id === "s1")).toHaveLength(1)
  })

  it("no_misma_tarea: hard rule separates staff on same task", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk2", organisation_id: ORG, staff_id: "s1", skill: "ICSI", level: "certified", created_at: "" },
      ]}),
      makeStaff({ id: "s2", role: "lab", staff_skills: [
        { id: "sk3", organisation_id: ORG, staff_id: "s2", skill: "OPU", level: "certified", created_at: "" },
        { id: "sk4", organisation_id: ORG, staff_id: "s2", skill: "ICSI", level: "certified", created_at: "" },
      ]}),
    ]

    const rules: RotaRule[] = [{
      id: "r1", organisation_id: ORG, type: "no_misma_tarea",
      is_hard: true, enabled: true, staff_ids: ["s1", "s2"],
      params: {}, notes: null,
      created_at: "", updated_at: "", expires_at: null,
    }]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: [
        { codigo: "OPU", department: "lab", typical_shifts: [], avoid_shifts: [] },
        { codigo: "ICSI", department: "lab", typical_shifts: [], avoid_shifts: [] },
      ],
      rules,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU:  { mon: 2, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
        ICSI: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      },
    })

    const monday = result.days[0]
    const opuStaff = monday.assignments.filter((a) => a.function_label === "OPU").map((a) => a.staff_id)
    // OPU needs 2 people, but no_misma_tarea rule should separate s1 and s2
    // One should be on OPU, the other reassigned to ICSI or removed
    expect(opuStaff).not.toEqual(expect.arrayContaining(["s1", "s2"]))
  })
})

// ── OFF staff ────────────────────────────────────────────────────────────────

describe("OFF staff", () => {
  it("includes available staff not assigned to any task", () => {
    const staff = [
      makeStaff({ id: "s1", role: "lab", staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "OPU", level: "certified", created_at: "" },
      ]}),
      makeStaff({ id: "s2", role: "lab", days_per_week: 3, staff_skills: [] }),
    ]

    const result = runTaskEngine({
      weekStart: WEEK,
      staff,
      leaves: [],
      recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1],
      tecnicas: TECNICAS,
      taskCoverageEnabled: true,
      taskCoverageByDay: {
        OPU: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 },
      },
    })

    // s2 has no skills so won't be assigned but is available → should be OFF
    const monday = result.days[0]
    expect(monday.offStaff).toContain("s2")
  })
})
