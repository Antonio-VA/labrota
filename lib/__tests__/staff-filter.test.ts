import { describe, it, expect } from "vitest"
import { filterStaffForPicker } from "@/lib/staff-filter"
import type { StaffWithSkills } from "@/lib/types/database"

// ── Fixtures ─────────────────────────────────────────────────────────────────

function staff(
  id: string,
  first: string,
  last: string,
  skills: Array<{ skill: string; level?: "certified" | "training" }> = [],
  status: "active" | "inactive" = "active",
): StaffWithSkills {
  return {
    id,
    first_name: first,
    last_name: last,
    onboarding_status: status,
    staff_skills: skills.map((s) => ({
      id: `sk-${id}-${s.skill}`,
      staff_id: id,
      skill: s.skill,
      level: s.level ?? "certified",
    })),
    // Minimal fill — the function only touches the fields above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const ANA   = staff("a", "Ana",   "Lopez",   [{ skill: "ICSI" }])
const BORIS = staff("b", "Boris", "Martin",  [{ skill: "icsi" }]) // lower-case on purpose
const CARLA = staff("c", "Carla", "Nguyen",  [{ skill: "ICSI", level: "training" }])
const DIANA = staff("d", "Diana", "Ortiz",   [{ skill: "BIOPSIA" }])
const EVA   = staff("e", "Eva",   "Perez",   [{ skill: "ICSI" }], "inactive")

const ALL = [ANA, BORIS, CARLA, DIANA, EVA]

// ── Tests ────────────────────────────────────────────────────────────────────

describe("filterStaffForPicker", () => {
  it("returns only staff qualified for the tecnica (case-insensitive)", () => {
    // Request is 'icsi' — should match ANA (stored as 'ICSI'), BORIS ('icsi'),
    // CARLA ('ICSI' training). Not DIANA (BIOPSIA).
    const r = filterStaffForPicker(ALL, { tecnicaCode: "icsi" })
    const ids = r.map((s) => s.id).sort()
    expect(ids).toEqual(["a", "b", "c"])
  })

  it("excludes inactive staff by default", () => {
    const r = filterStaffForPicker(ALL, { tecnicaCode: "ICSI" })
    expect(r.map((s) => s.id)).not.toContain("e")
  })

  it("can opt into including inactive staff", () => {
    const r = filterStaffForPicker(ALL, { tecnicaCode: "ICSI", excludeInactive: false })
    expect(r.map((s) => s.id)).toContain("e")
  })

  it("can restrict to certified only (drops training)", () => {
    const r = filterStaffForPicker(ALL, { tecnicaCode: "ICSI", certifiedOnly: true })
    expect(r.map((s) => s.id).sort()).toEqual(["a", "b"])
  })

  it("sorts results by first name then last name", () => {
    const r = filterStaffForPicker(ALL, { tecnicaCode: "ICSI" })
    expect(r.map((s) => s.first_name)).toEqual(["Ana", "Boris", "Carla"])
  })

  it("matches search against full name", () => {
    const r = filterStaffForPicker(ALL, { tecnicaCode: "ICSI", search: "bor" })
    expect(r.map((s) => s.id)).toEqual(["b"])
  })

  it("matches search against initials", () => {
    // 'cn' = Carla Nguyen initials.
    const r = filterStaffForPicker(ALL, { tecnicaCode: "ICSI", search: "cn" })
    expect(r.map((s) => s.id)).toEqual(["c"])
  })

  it("treats empty or whitespace search as no filter", () => {
    const r1 = filterStaffForPicker(ALL, { tecnicaCode: "ICSI", search: "" })
    const r2 = filterStaffForPicker(ALL, { tecnicaCode: "ICSI", search: "   " })
    expect(r1.map((s) => s.id)).toEqual(["a", "b", "c"])
    expect(r2.map((s) => s.id)).toEqual(["a", "b", "c"])
  })

  it("returns an empty array when nobody matches", () => {
    const r = filterStaffForPicker(ALL, { tecnicaCode: "ICSI", search: "zzz" })
    expect(r).toEqual([])
  })

  it("returns an empty array for a tecnica nobody has", () => {
    const r = filterStaffForPicker(ALL, { tecnicaCode: "DOESNOTEXIST" })
    expect(r).toEqual([])
  })
})
