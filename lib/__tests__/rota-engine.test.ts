import { describe, it, expect } from "vitest"
import { runRotaEngine, getWeekDates, getMondayOfWeek } from "../rota-engine"
import type {
  StaffWithSkills,
  Leave,
  LabConfig,
  ShiftTypeDefinition,
  RotaRule,
} from "../types/database"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG = "org-1"

const BASE_CONFIG = {
  id: "cfg-1",
  organisation_id: ORG,
  min_lab_coverage: 1,
  min_andrology_coverage: 1,
  min_weekend_andrology: 1,
  min_weekend_lab_coverage: 1,
  staffing_ratio: 3,
  punctions_by_day: {},
  coverage_by_day: null,
  admin_on_weekends: false,
  admin_default_shift: "T1",
  created_at: "",
  updated_at: "",
} as unknown as LabConfig

const SHIFT_T1: ShiftTypeDefinition = {
  id: "s1", organisation_id: ORG, code: "T1", name_es: "Mañana", name_en: "Morning",
  start_time: "08:00", end_time: "15:00", sort_order: 1, created_at: "",
}
const SHIFT_T2: ShiftTypeDefinition = {
  id: "s2", organisation_id: ORG, code: "T2", name_es: "Tarde", name_en: "Afternoon",
  start_time: "13:00", end_time: "20:00", sort_order: 2, created_at: "",
}

function makeStaff(overrides: Partial<StaffWithSkills> & { id: string }): StaffWithSkills {
  return {
    organisation_id: ORG,
    first_name: "Ana",
    last_name: "García",
    email: null,
    role: "lab",
    working_pattern: ["mon", "tue", "wed", "thu", "fri"],
    preferred_days: null,
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
  }
}

// Week of 2026-03-16 (Mon) through 2026-03-22 (Sun)
const WEEK = "2026-03-16"

// ── Helpers ───────────────────────────────────────────────────────────────────

describe("getWeekDates", () => {
  it("returns 7 dates starting from Monday", () => {
    const dates = getWeekDates(WEEK)
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe("2026-03-16") // Mon
    expect(dates[6]).toBe("2026-03-22") // Sun
  })
})

describe("getMondayOfWeek", () => {
  it("returns Monday for a Monday input", () => {
    expect(getMondayOfWeek(new Date("2026-03-16"))).toBe("2026-03-16")
  })
  it("returns Monday for a Wednesday input", () => {
    expect(getMondayOfWeek(new Date("2026-03-18"))).toBe("2026-03-16")
  })
  it("returns Monday for a Sunday input", () => {
    expect(getMondayOfWeek(new Date("2026-03-22"))).toBe("2026-03-16")
  })
})

// ── Core assignment logic ─────────────────────────────────────────────────────

describe("runRotaEngine — basic assignment", () => {
  it("assigns active lab staff on their working days", () => {
    const staff = [makeStaff({ id: "s1" })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    // Mon–Fri assigned, Sat–Sun not
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    const sat = result.days.find((d) => d.date === "2026-03-21")!
    const sun = result.days.find((d) => d.date === "2026-03-22")!
    expect(mon.assignments).toHaveLength(1)
    expect(sat.assignments).toHaveLength(0)
    expect(sun.assignments).toHaveLength(0)
  })

  it("does not assign inactive staff", () => {
    const staff = [makeStaff({ id: "s1", onboarding_status: "inactive" })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    expect(result.days.every((d) => d.assignments.length === 0)).toBe(true)
  })

  it("respects staff start_date", () => {
    // Staff starts Wednesday — should only appear Wed–Fri
    const staff = [makeStaff({ id: "s1", start_date: "2026-03-18" })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    expect(result.days.find((d) => d.date === "2026-03-16")!.assignments).toHaveLength(0) // Mon
    expect(result.days.find((d) => d.date === "2026-03-17")!.assignments).toHaveLength(0) // Tue
    expect(result.days.find((d) => d.date === "2026-03-18")!.assignments).toHaveLength(1) // Wed
    expect(result.days.find((d) => d.date === "2026-03-20")!.assignments).toHaveLength(1) // Fri
  })

  it("respects staff end_date", () => {
    // Staff ends Tuesday
    const staff = [makeStaff({ id: "s1", end_date: "2026-03-17" })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    expect(result.days.find((d) => d.date === "2026-03-16")!.assignments).toHaveLength(1) // Mon ✓
    expect(result.days.find((d) => d.date === "2026-03-17")!.assignments).toHaveLength(1) // Tue ✓
    expect(result.days.find((d) => d.date === "2026-03-18")!.assignments).toHaveLength(0) // Wed ✗
  })
})

// ── Leave filtering ───────────────────────────────────────────────────────────

describe("runRotaEngine — leave", () => {
  it("does not assign staff on leave days", () => {
    const staff = [makeStaff({ id: "s1" })]
    const leaves: Leave[] = [{
      id: "l1", organisation_id: ORG, staff_id: "s1",
      type: "annual", status: "approved",
      start_date: "2026-03-16", end_date: "2026-03-18", // Mon–Wed
      notes: null, created_at: "", updated_at: "", created_by: null,
    } as never]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves, recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    expect(result.days.find((d) => d.date === "2026-03-16")!.assignments).toHaveLength(0) // Mon on leave
    expect(result.days.find((d) => d.date === "2026-03-18")!.assignments).toHaveLength(0) // Wed on leave
    expect(result.days.find((d) => d.date === "2026-03-19")!.assignments).toHaveLength(1) // Thu OK
  })

  it("discounts leave days from weekly shift budget", () => {
    // Staff has 5 days/week; 3 days on leave → budget = 2
    const staff = [makeStaff({ id: "s1", days_per_week: 5 })]
    const leaves: Leave[] = [{
      id: "l1", organisation_id: ORG, staff_id: "s1",
      type: "annual", status: "approved",
      start_date: "2026-03-16", end_date: "2026-03-18", // Mon–Wed (3 days)
      notes: null, created_at: "", updated_at: "", created_by: null,
    } as never]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves, recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    // Available working days = Mon–Fri = 5; leave = 3; budget = 2
    // Should be assigned Thu + Fri only (2 shifts)
    const assigned = result.days.filter((d) => d.assignments.length > 0)
    expect(assigned).toHaveLength(2) // Thu + Fri
  })
})

// ── Weekly shift budget ───────────────────────────────────────────────────────

describe("runRotaEngine — shift budget", () => {
  it("does not assign more shifts than days_per_week", () => {
    // 4-day week staff, working pattern Mon–Fri
    const staff = [makeStaff({ id: "s1", days_per_week: 3 })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    const count = result.days.filter((d) => d.assignments.length > 0).length
    expect(count).toBe(3)
  })

  it("reserves weekend slots before filling weekdays", () => {
    // Staff works Mon–Fri + Sat; 6 days/week
    const staff = [makeStaff({ id: "s1", days_per_week: 6, working_pattern: ["mon", "tue", "wed", "thu", "fri", "sat"] })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    // Should be assigned 5 weekdays + 1 Saturday = 6
    const count = result.days.filter((d) => d.assignments.length > 0).length
    expect(count).toBe(6)
    // Saturday should be assigned
    expect(result.days.find((d) => d.date === "2026-03-21")!.assignments).toHaveLength(1)
  })
})

// ── Preferred days (soft constraint) ──────────────────────────────────────────

describe("runRotaEngine — preferred days", () => {
  it("preferred_days staff are sorted before non-preferred on that day", () => {
    // Both work Mon-Fri, but s1 prefers Mon, s2 does not
    // With days_per_week=1, only one gets Monday — should be s1
    const staff = [
      makeStaff({ id: "s1", first_name: "Preferred", days_per_week: 1, preferred_days: ["mon"] }),
      makeStaff({ id: "s2", first_name: "NoPreference", days_per_week: 1, preferred_days: [] }),
    ]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    // s1 prefers Monday → assigned first
    expect(mon.assignments[0].staff_id).toBe("s1")
  })

  it("null preferred_days treated as no preference (all equal)", () => {
    const staff = [
      makeStaff({ id: "s1", preferred_days: null }),
      makeStaff({ id: "s2", preferred_days: null }),
    ]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    // Both should be assigned (no filtering, just workload sort)
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    expect(mon.assignments).toHaveLength(2)
  })
})

// ── Shift distribution ────────────────────────────────────────────────────────

describe("runRotaEngine — shift types", () => {
  it("uses T1 by default when no shift types provided", () => {
    const staff = [makeStaff({ id: "s1" })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    expect(mon.assignments[0].shift_type).toBe("T1")
  })

  it("distributes staff round-robin across available shifts", () => {
    // 2 lab staff, 2 shift types — each should get a different shift
    const staff = [
      makeStaff({ id: "s1", first_name: "Ana" }),
      makeStaff({ id: "s2", first_name: "Bea" }),
    ]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1, SHIFT_T2],
    })
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    const shifts = mon.assignments.map((a) => a.shift_type).sort()
    expect(shifts).toEqual(["T1", "T2"])
  })

  it("respects preferred_shift for individual staff", () => {
    const staff = [makeStaff({ id: "s1", preferred_shift: "T2" })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
      shiftTypes: [SHIFT_T1, SHIFT_T2],
    })
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    expect(mon.assignments[0].shift_type).toBe("T2")
  })
})

// ── Workload fairness ─────────────────────────────────────────────────────────

describe("runRotaEngine — workload scoring", () => {
  it("prioritises staff with fewer recent shifts", () => {
    // 2 staff, 1 budget slot only; s2 has more recent history → s1 gets priority
    const staff = [
      makeStaff({ id: "s1", first_name: "Low", days_per_week: 1 }),
      makeStaff({ id: "s2", first_name: "High", days_per_week: 1 }),
    ]
    const recentAssignments = [
      { id: "r1", staff_id: "s2", date: "2026-03-09", shift_type: "T1", is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, rota_id: "r", organisation_id: ORG, created_at: "", updated_at: "" },
      { id: "r2", staff_id: "s2", date: "2026-03-10", shift_type: "T1", is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, rota_id: "r", organisation_id: ORG, created_at: "", updated_at: "" },
    ] as never[]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments,
      labConfig: BASE_CONFIG,
    })
    // Monday: only 1 slot per person (days_per_week=1); s1 should win the first available day
    const monAssignees = result.days.find((d) => d.date === "2026-03-16")!.assignments
    expect(monAssignees[0].staff_id).toBe("s1")
  })
})

// ── Admin role ────────────────────────────────────────────────────────────────

describe("runRotaEngine — admin", () => {
  it("assigns at most 1 admin per day", () => {
    const staff = [
      makeStaff({ id: "a1", role: "admin" }),
      makeStaff({ id: "a2", role: "admin" }),
    ]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    for (const day of result.days) {
      const adminCount = day.assignments.filter((a) =>
        staff.find((s) => s.id === a.staff_id)?.role === "admin"
      ).length
      expect(adminCount).toBeLessThanOrEqual(1)
    }
  })

  it("does not assign admin on weekends when admin_on_weekends is false", () => {
    const staff = [makeStaff({ id: "a1", role: "admin", working_pattern: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: { ...BASE_CONFIG, admin_on_weekends: false },
    })
    const sat = result.days.find((d) => d.date === "2026-03-21")!
    const sun = result.days.find((d) => d.date === "2026-03-22")!
    expect(sat.assignments).toHaveLength(0)
    expect(sun.assignments).toHaveLength(0)
  })
})

// ── Coverage warnings ─────────────────────────────────────────────────────────

describe("runRotaEngine — coverage warnings", () => {
  it("emits warning when lab coverage is below minimum", () => {
    // min_lab_coverage = 2 but only 1 lab staff
    const staff = [makeStaff({ id: "s1" })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: { ...BASE_CONFIG, min_lab_coverage: 2 },
    })
    const warns = result.warnings.filter((w) => w.includes("lab staff available"))
    expect(warns.length).toBeGreaterThan(0)
  })

  it("emits skill gap warning when required skill is uncovered", () => {
    // Staff has egg_collection but not biopsy
    const staff = [makeStaff({
      id: "s1",
      staff_skills: [
        { id: "sk1", organisation_id: ORG, staff_id: "s1", skill: "egg_collection", level: "certified", created_at: "" },
        { id: "sk2", organisation_id: ORG, staff_id: "s1", skill: "biopsy", level: "certified", created_at: "" },
      ],
    })]
    // Add second staff with only icsi — means biopsy won't be covered each day when s1 is off
    // Simpler: just one staff with egg_collection; engine warns if canonical skill is missing from assigned
    const staffNoBiopsy = [makeStaff({
      id: "s2",
      staff_skills: [
        { id: "sk3", organisation_id: ORG, staff_id: "s2", skill: "egg_collection", level: "certified", created_at: "" },
      ],
    })]
    const result = runRotaEngine({
      weekStart: WEEK, staff: staffNoBiopsy, leaves: [], recentAssignments: [],
      labConfig: BASE_CONFIG,
    })
    // biopsy is a canonical skill but s2 doesn't have it — warning expected
    expect(result.warnings.some((w) => w.includes("skill gap"))).toBe(true)
  })
})

// ── Scheduling rules ──────────────────────────────────────────────────────────

describe("runRotaEngine — rules", () => {
  it("max_dias_consecutivos (hard): removes staff after N consecutive days", () => {
    const staff = [makeStaff({ id: "s1" })]
    // Seed 5 consecutive days immediately before Monday
    const recentAssignments = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`, staff_id: "s1",
      date: new Date(new Date("2026-03-16T12:00:00").getTime() - (5 - i) * 86400000)
        .toISOString().split("T")[0],
      shift_type: "T1", is_manual_override: false,
      function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null,
      rota_id: "r", organisation_id: ORG, created_at: "", updated_at: "",
    })) as never[]
    const rule: RotaRule = {
      id: "rule1", organisation_id: ORG, type: "max_dias_consecutivos",
      is_hard: true, enabled: true, staff_ids: [], params: { maxDays: 5 },
      notes: null, created_at: "", updated_at: "",
    }
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments,
      labConfig: BASE_CONFIG, rules: [rule],
    })
    // Monday: s1 has already worked 5 consecutive days → should be excluded
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    expect(mon.assignments.find((a) => a.staff_id === "s1")).toBeUndefined()
  })

  it("max_dias_consecutivos (soft): emits warning instead of removing", () => {
    const staff = [makeStaff({ id: "s1" })]
    const recentAssignments = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`, staff_id: "s1",
      date: new Date(new Date("2026-03-16T12:00:00").getTime() - (5 - i) * 86400000)
        .toISOString().split("T")[0],
      shift_type: "T1", is_manual_override: false,
      function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null,
      rota_id: "r", organisation_id: ORG, created_at: "", updated_at: "",
    })) as never[]
    const rule: RotaRule = {
      id: "rule1", organisation_id: ORG, type: "max_dias_consecutivos",
      is_hard: false, enabled: true, staff_ids: [], params: { maxDays: 5 },
      notes: null, created_at: "", updated_at: "",
    }
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments,
      labConfig: BASE_CONFIG, rules: [rule],
    })
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    // Staff still assigned (soft rule)
    expect(mon.assignments.find((a) => a.staff_id === "s1")).toBeDefined()
    // But a warning emitted
    expect(result.warnings.some((w) => w.includes("consecutive days"))).toBe(true)
  })

  it("no_coincidir (hard): removes lower-workload staff when two conflict", () => {
    const staff = [
      makeStaff({ id: "s1", first_name: "Ana" }),
      makeStaff({ id: "s2", first_name: "Bea" }),
    ]
    // s2 has higher recent workload
    const recentAssignments = [
      { id: "r1", staff_id: "s2", date: "2026-03-09", shift_type: "T1", is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, rota_id: "r", organisation_id: ORG, created_at: "", updated_at: "" },
      { id: "r2", staff_id: "s2", date: "2026-03-10", shift_type: "T1", is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, rota_id: "r", organisation_id: ORG, created_at: "", updated_at: "" },
    ] as never[]
    const rule: RotaRule = {
      id: "rule2", organisation_id: ORG, type: "no_coincidir",
      is_hard: true, enabled: true, staff_ids: ["s1", "s2"], params: {},
      notes: null, created_at: "", updated_at: "",
    }
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments,
      labConfig: BASE_CONFIG, rules: [rule],
    })
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    // s1 has fewer recent shifts (lower workload) → keeps; s2 has more → removed
    const ids = mon.assignments.map((a) => a.staff_id)
    expect(ids).toContain("s1")
    expect(ids).not.toContain("s2")
  })

  it("disabled rules are ignored", () => {
    const staff = [makeStaff({ id: "s1" })]
    const recentAssignments = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`, staff_id: "s1",
      date: new Date(new Date("2026-03-16T12:00:00").getTime() - (5 - i) * 86400000)
        .toISOString().split("T")[0],
      shift_type: "T1", is_manual_override: false,
      function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null,
      rota_id: "r", organisation_id: ORG, created_at: "", updated_at: "",
    })) as never[]
    const rule: RotaRule = {
      id: "rule1", organisation_id: ORG, type: "max_dias_consecutivos",
      is_hard: true, enabled: false, staff_ids: [], params: { maxDays: 5 }, // disabled
      notes: null, created_at: "", updated_at: "",
    }
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments,
      labConfig: BASE_CONFIG, rules: [rule],
    })
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    // Disabled rule → staff still assigned
    expect(mon.assignments.find((a) => a.staff_id === "s1")).toBeDefined()
  })
})

// ── Punctions / dynamic lab coverage ─────────────────────────────────────────

describe("runRotaEngine — punctions & dynamic coverage", () => {
  it("emits warning when punctions require more lab staff than available", () => {
    // staffing_ratio = 3; punctions = 9 → need 3 lab staff; only 1 available
    const staff = [makeStaff({ id: "s1" })]
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: { ...BASE_CONFIG, staffing_ratio: 3 },
      punctionsOverride: { "2026-03-16": 9 },
    })
    expect(result.warnings.some((w) => w.includes("2026-03-16") && w.includes("lab staff available"))).toBe(true)
  })

  it("per-date punctions override config default", () => {
    const staff = Array.from({ length: 4 }, (_, i) =>
      makeStaff({ id: `s${i}`, first_name: `S${i}` })
    )
    // Config default for Monday = 0, override = 3, ratio = 3 → dynamicLabMin = 1, 4 available → no shortage
    const result = runRotaEngine({
      weekStart: WEEK, staff, leaves: [], recentAssignments: [],
      labConfig: { ...BASE_CONFIG, min_lab_coverage: 1, min_andrology_coverage: 0, min_weekend_andrology: 0 },
      punctionsOverride: { "2026-03-16": 3 },
    })
    // No lab shortage warning on Monday (4 available ≥ 1 required)
    const monLabWarns = result.warnings.filter((w) =>
      w.includes("2026-03-16") && w.includes("lab staff available")
    )
    expect(monLabWarns).toHaveLength(0)
    // All 4 staff assigned on Monday
    const mon = result.days.find((d) => d.date === "2026-03-16")!
    expect(mon.assignments).toHaveLength(4)
  })
})
