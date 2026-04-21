import type {
  StaffWithSkills,
  RotaRule,
  ShiftType,
  ShiftTypeDefinition,
  ShiftCoverageByDay,
} from "@/lib/types/database"
import { normalizeShiftCov } from "@/lib/engine-helpers"
import type { DayPlan } from "./types"

export interface AlignTechniquesContext {
  date: string
  dayCode: string
  dayPlan: DayPlan
  dayShiftSet: Set<string>
  defaultShiftCodes: string[]

  // Mutable per-day state shared with the main engine loop
  assigned: StaffWithSkills[]
  assignedById: Map<string, StaffWithSkills>
  assignedByDate: Record<string, Set<string>>

  // Read-only from the week / engine level
  staff: StaffWithSkills[]
  rules: RotaRule[]
  tecnicaTypicalShifts: Record<string, Set<string>>
  leaveMap: Record<string, Set<string>>
  weeklyShiftCount: Record<string, number>
  workloadScore: Record<string, number>
  shiftCoverageEnabled: boolean
  shiftCoverageByDay?: ShiftCoverageByDay | null
  shiftTypes: ShiftTypeDefinition[]

  // Out — appended to in place
  warnings: string[]
}

/**
 * After shift-distribution, verify every technique's typical_shift has at
 * least one certified person. If a shift is missing coverage for a mapped
 * technique, try to swap with a qualified person from another shift, or
 * (outside coverage-aware mode) add an unassigned qualified staff member.
 *
 * Extracted from the main `runRotaEngineV2` body so it's greppable; the
 * function mutates `dayPlan.assignments`, `assigned`, `assignedByDate`,
 * and `warnings` in place — same contract as the inlined version.
 */
export function alignTechniquesForDay(ctx: AlignTechniquesContext): void {
  const {
    date, dayCode, dayPlan, dayShiftSet, defaultShiftCodes,
    assigned, assignedById, assignedByDate,
    staff, rules, tecnicaTypicalShifts,
    leaveMap, weeklyShiftCount, workloadScore,
    shiftCoverageEnabled, shiftCoverageByDay, shiftTypes,
    warnings,
  } = ctx

  // Staff protected by supervisor rules (active today) — never move them.
  const supervisedStaffIds = new Set<string>()
  for (const rule of rules.filter((r) => r.enabled && r.type === "supervisor_requerido")) {
    const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
    if (supDays.length > 0 && !supDays.includes(dayCode)) continue
    for (const id of rule.staff_ids) supervisedStaffIds.add(id)
  }

  // Group techniques by their typical shift.
  const techByShift: Record<string, string[]> = {}
  for (const [codigo, shifts] of Object.entries(tecnicaTypicalShifts)) {
    for (const sc of shifts) {
      if (!techByShift[sc]) techByShift[sc] = []
      techByShift[sc].push(codigo)
    }
  }

  // Shift counts for minimum-protection during alignment.
  const shiftCountAfterDist: Record<string, number> = {}
  for (const sc of defaultShiftCodes) shiftCountAfterDist[sc] = 0
  for (const a of dayPlan.assignments) shiftCountAfterDist[a.shift_type] = (shiftCountAfterDist[a.shift_type] ?? 0) + 1

  const shiftMinForGuard: Record<string, number> = {}
  if (shiftCoverageEnabled && shiftCoverageByDay) {
    for (const sc of defaultShiftCodes) {
      const cov = normalizeShiftCov(shiftCoverageByDay[sc]?.[dayCode])
      shiftMinForGuard[sc] = cov.lab + cov.andrology + cov.admin
    }
  }

  for (const [shiftCode, techCodes] of Object.entries(techByShift)) {
    if (!dayShiftSet.has(shiftCode)) continue
    const staffInShift = dayPlan.assignments.filter((a) => a.shift_type === shiftCode)

    for (const techCode of techCodes) {
      const hasCoverage = staffInShift.some((a) => {
        const member = assignedById.get(a.staff_id)
        return member?.staff_skills.some((sk) => sk.skill === techCode && sk.level === "certified")
      })
      if (hasCoverage) continue

      // Gap found — try to resolve.
      //
      // 1. Try to swap: find someone in ANOTHER shift who is qualified and
      //    move them here. Never move someone out of a shift that would
      //    drop below its minimum or out of a supervisor rule.
      let resolved = false
      const qualifiedInOtherShifts = dayPlan.assignments.filter((a) => {
        if (a.shift_type === shiftCode) return false
        if (!assignedById.get(a.staff_id)?.staff_skills.some((sk) => sk.skill === techCode && sk.level === "certified")) return false
        if (supervisedStaffIds.has(a.staff_id)) return false
        const sourceMin = shiftMinForGuard[a.shift_type] ?? 0
        if (sourceMin > 0 && (shiftCountAfterDist[a.shift_type] ?? 0) <= sourceMin) return false
        return true
      })

      if (qualifiedInOtherShifts.length > 0) {
        // Pick rarest: person whose qualification is shared by fewest others.
        const scored = qualifiedInOtherShifts.map((a) => {
          const qualCount = assigned.filter((s) =>
            s.staff_skills.some((sk) => sk.skill === techCode)
          ).length
          return { a, rarity: qualCount, workload: workloadScore[a.staff_id] ?? 0 }
        }).sort((x, y) => x.rarity - y.rarity || x.workload - y.workload)

        for (const { a: candidate } of scored) {
          const member = assignedById.get(candidate.staff_id)
          const prefShifts = member?.preferred_shift?.split(",").filter(Boolean) ?? []
          // Block swap only if the person explicitly prefers their CURRENT shift.
          if (prefShifts.length > 0 && prefShifts.includes(candidate.shift_type)) continue
          shiftCountAfterDist[candidate.shift_type]--
          shiftCountAfterDist[shiftCode] = (shiftCountAfterDist[shiftCode] ?? 0) + 1
          candidate.shift_type = shiftCode as ShiftType
          resolved = true
          break
        }
      }

      // 2. Try to add: find an unassigned qualified staff member.
      //    Skip when coverage-aware distribution is active — minimums are
      //    already enforced and adding extra staff would break budgets.
      if (!resolved && !shiftCoverageEnabled) {
        const unassigned = staff.filter((s) =>
          !(assignedByDate[date] ?? new Set()).has(s.id) &&
          !leaveMap[s.id]?.has(date) &&
          s.onboarding_status === "active" &&
          (weeklyShiftCount[s.id] ?? 0) < (s.days_per_week ?? 5) &&
          s.staff_skills.some((sk) => sk.skill === techCode)
        )
        if (unassigned.length > 0) {
          const scored = unassigned.map((s) => {
            const qualCount = staff.filter((o) =>
              o.staff_skills.some((sk) => sk.skill === techCode)
            ).length
            return { s, rarity: qualCount, workload: workloadScore[s.id] ?? 0 }
          }).sort((x, y) => x.rarity - y.rarity || x.workload - y.workload)

          const pick = scored[0].s
          dayPlan.assignments.push({ staff_id: pick.id, shift_type: shiftCode as ShiftType })
          assigned.push(pick)
          if (!assignedByDate[date]) assignedByDate[date] = new Set()
          assignedByDate[date].add(pick.id)
          resolved = true
        }
      }

      if (!resolved) {
        const shiftDef = shiftTypes.find((st) => st.code === shiftCode)
        const shiftName = shiftDef ? shiftDef.code : shiftCode
        // Internal log only — getRotaWeek generates the user-facing
        // "technique_shift_gap" warning with full technique names.
        warnings.push(`[engine] ${date}: ${shiftName} sin personal cualificado para ${techCode}`)
      }
    }
  }
}
