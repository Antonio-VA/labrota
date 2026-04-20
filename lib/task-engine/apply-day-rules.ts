import type { StaffWithSkills, RotaRule, RotaAssignment } from "@/lib/types/database"
import { getDayCode, isWeekend, addDays } from "@/lib/engine-helpers"

export interface DayRulesParams {
  date: string
  dayCode: string
  weekend: boolean
  rules: RotaRule[]
  eligibleStaff: StaffWithSkills[]
  reservedIds: Set<string>
  recentAssignments: RotaAssignment[]
  workloadScore: Record<string, number>
  consecutiveDaysBefore: (staffId: string, date: string) => number
  warnings: string[]
}

export interface DayRulesResult {
  hardRemovals: Set<string>
  fixedShiftOverrides: Record<string, string>
}

/**
 * Apply per-day scheduling rules (max_dias_consecutivos, distribucion_fines_semana,
 * no_coincidir, descanso_fin_de_semana, asignacion_fija) to filter out staff
 * who shouldn't work today. Pushes violation messages into `warnings`.
 */
export function applyDayRules({
  date,
  dayCode,
  weekend,
  rules,
  eligibleStaff,
  reservedIds,
  recentAssignments,
  workloadScore,
  consecutiveDaysBefore,
  warnings,
}: DayRulesParams): DayRulesResult {
  const hardRemovals = new Set<string>()
  const fixedShiftOverrides: Record<string, string> = {}

  if (rules.length > 0) {
    const dateMonth = date.slice(0, 7)
    const weekendCountThisMonth: Record<string, number> = {}
    for (const a of recentAssignments) {
      if (a.date.slice(0, 7) === dateMonth && isWeekend(a.date)) {
        weekendCountThisMonth[a.staff_id] = (weekendCountThisMonth[a.staff_id] ?? 0) + 1
      }
    }

    for (const rule of rules.filter((r) => r.enabled)) {
      const affectedIds = rule.staff_ids.length > 0 ? new Set(rule.staff_ids) : null
      const affects = (id: string) => affectedIds === null || affectedIds.has(id)

      if (rule.type === "max_dias_consecutivos") {
        const maxDays = (rule.params.maxDays as number) ?? 5
        for (const s of eligibleStaff) {
          if (!affects(s.id)) continue
          if (consecutiveDaysBefore(s.id, date) >= maxDays) {
            if (rule.is_hard) {
              hardRemovals.add(s.id)
              warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — ${maxDays} días consecutivos (regla obligatoria)`)
            } else {
              warnings.push(`${date}: ${s.first_name} ${s.last_name} lleva ${maxDays} días consecutivos`)
            }
          }
        }
      }

      if (rule.type === "distribucion_fines_semana" && weekend) {
        const maxPerMonth = (rule.params.maxPerMonth as number) ?? 2
        for (const s of eligibleStaff) {
          if (!affects(s.id)) continue
          if ((weekendCountThisMonth[s.id] ?? 0) >= maxPerMonth) {
            if (rule.is_hard) {
              hardRemovals.add(s.id)
              warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — ${maxPerMonth} fines de semana este mes (regla obligatoria)`)
            } else {
              warnings.push(`${date}: ${s.first_name} ${s.last_name} lleva ${maxPerMonth} fines de semana este mes`)
            }
          }
        }
      }

      if (rule.type === "no_coincidir") {
        const scope = (rule.params.scope as string | undefined) ?? "same_day"
        const ruleDays = (rule.params.days as string[] | undefined) ?? []
        if (ruleDays.length > 0 && !ruleDays.includes(dayCode)) {
          // Rule doesn't apply today — skip
        } else if (scope === "same_day") {
          const ruleStaff = rule.staff_ids
          if (ruleStaff.length >= 2) {
            const present = eligibleStaff.filter((s) => ruleStaff.includes(s.id) && !hardRemovals.has(s.id))
            if (present.length >= 2 && rule.is_hard) {
              present.sort((a, b) => (workloadScore[b.id] ?? 0) - (workloadScore[a.id] ?? 0))
              for (let i = 1; i < present.length; i++) {
                if (!reservedIds.has(present[i].id)) {
                  hardRemovals.add(present[i].id)
                }
              }
              const removedNames = present.slice(1).filter((s) => !reservedIds.has(s.id)).map((s) => s.first_name)
              if (removedNames.length > 0) {
                warnings.push(`${date}: ${removedNames.join(", ")} retirado — no coincidir con ${present[0].first_name} (regla obligatoria)`)
              }
            } else if (present.length >= 2) {
              warnings.push(`${date}: ${present.map((s) => s.first_name).join(" + ")} assigned together (no_coincidir, soft)`)
            }
          }
        }
        // scope === "same_shift" not applicable in task engine (no shifts)
      }

      if (rule.type === "descanso_fin_de_semana" && weekend) {
        const recovery = (rule.params.recovery as string) ?? "following"
        const restDays = (rule.params.restDays as number) ?? 2

        for (const s of eligibleStaff) {
          if (!affects(s.id)) continue
          const prevSat = addDays(date, -(dayCode === "sat" ? 7 : 8))
          const prevSun = addDays(date, -(dayCode === "sun" ? 7 : 6))
          const workedLastWeekend = recentAssignments.some(
            (a) => a.staff_id === s.id && (a.date === prevSat || a.date === prevSun)
          )

          if (recovery === "following" && workedLastWeekend) {
            if (rule.is_hard) {
              hardRemovals.add(s.id)
              warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — trabajó el fin de semana pasado (regla obligatoria)`)
            } else {
              warnings.push(`${date}: ${s.first_name} ${s.last_name} worked last weekend — needs rest (descanso_fin_de_semana)`)
            }
          } else if (recovery === "previous" && workedLastWeekend) {
            if (rule.is_hard) {
              hardRemovals.add(s.id)
              warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — fines de semana alternos (regla obligatoria)`)
            } else {
              warnings.push(`${date}: ${s.first_name} ${s.last_name} worked last weekend — alternating weekends required`)
            }
          }
        }

        // Rest days after weekend (weekday check)
        if (restDays > 0 && !weekend) {
          for (const s of eligibleStaff) {
            if (!affects(s.id)) continue
            const lastWorkedWeekend = [...recentAssignments]
              .filter((a) => a.staff_id === s.id && isWeekend(a.date))
              .sort((a, b) => b.date.localeCompare(a.date))[0]
            if (!lastWorkedWeekend) continue
            const diffMs = new Date(date + "T12:00:00").getTime() - new Date(lastWorkedWeekend.date + "T12:00:00").getTime()
            const diffDays = Math.round(diffMs / 86400000)
            if (diffDays > 0 && diffDays <= restDays) {
              if (rule.is_hard) {
                hardRemovals.add(s.id)
                warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — necesita ${restDays} días de descanso tras fin de semana (regla obligatoria)`)
              } else {
                warnings.push(`${date}: ${s.first_name} ${s.last_name} needs ${restDays} rest days after weekend`)
              }
            }
          }
        }
      }
    }
  }

  // asignacion_fija: force-include staff on specified days, prevent hard removals
  for (const rule of rules.filter((r) => r.enabled && r.type === "asignacion_fija")) {
    const fixedShift = rule.params.fixedShift as string | undefined
    const fixedDays = (rule.params.fixedDays as string[] | undefined) ?? []
    if (fixedDays.length > 0 && !fixedDays.includes(dayCode)) continue
    for (const staffId of rule.staff_ids) {
      const s = eligibleStaff.find((st) => st.id === staffId)
      if (!s) continue
      if (rule.is_hard) {
        hardRemovals.delete(staffId)
        if (fixedShift) fixedShiftOverrides[staffId] = fixedShift
        warnings.push(`${date}: ${s.first_name} ${s.last_name} — asignación fija${fixedShift ? ` (${fixedShift})` : ""}`)
      } else if (hardRemovals.has(staffId)) {
        warnings.push(`${date}: ${s.first_name} ${s.last_name} no asignado — asignación fija no cumplida (regla blanda)`)
      }
    }
  }

  return { hardRemovals, fixedShiftOverrides }
}
