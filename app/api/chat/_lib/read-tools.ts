import { tool } from "ai"
import { z } from "zod"
import type { StaffRole, SkillName, PunctionsByDay } from "@/lib/types/database"
import { toISODate } from "@/lib/format-date"
import { addDays } from "@/lib/engine-helpers"
import { LEAVE_TYPE_LABEL, SKILL_LABEL, type SupabaseClient } from "./shared"

export function buildReadTools(params: {
  supabase: SupabaseClient
  orgId: string
  viewingWeekStart?: string
  viewingWeekEnd?: string
}) {
  const { supabase, orgId, viewingWeekStart, viewingWeekEnd } = params

  return {
    getWeekRota: tool({
      description: "Get the rota assignments for a specific week. Returns staff assigned per day with shift types and function labels.",
      inputSchema: z.object({
        weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
      }),
      execute: async ({ weekStart }) => {
        const endDate = addDays(weekStart, 6)

        const [assignmentsRes, rotaRes] = await Promise.all([
          supabase
            .from("rota_assignments")
            .select("date, shift_type, function_label, is_manual_override, staff(first_name, last_name, role)")
            .eq("organisation_id", orgId)
            .gte("date", weekStart)
            .lte("date", endDate) as unknown as Promise<{ data: { date: string; shift_type: string; function_label: string | null; is_manual_override: boolean; staff: { first_name: string; last_name: string; role: string } | null }[] | null }>,
          supabase
            .from("rotas")
            .select("status, published_at")
            .eq("organisation_id", orgId)
            .eq("week_start", weekStart)
            .maybeSingle() as unknown as Promise<{ data: { status: string; published_at: string | null } | null }>,
        ])
        const assignments = assignmentsRes.data
        const rota = rotaRes.data

        if (!assignments || assignments.length === 0) {
          return { weekStart, status: "no_rota", days: [] }
        }

        const byDate: Record<string, { staff: string; role: string; shift: string; function: string | null; override: boolean }[]> = {}
        for (const a of assignments) {
          if (!a.staff) continue
          if (!byDate[a.date]) byDate[a.date] = []
          byDate[a.date].push({
            staff: `${a.staff.first_name} ${a.staff.last_name}`,
            role: a.staff.role,
            shift: a.shift_type,
            function: a.function_label,
            override: a.is_manual_override,
          })
        }

        return {
          weekStart,
          status: rota?.status ?? "draft",
          publishedAt: rota?.published_at ?? null,
          totalAssignments: assignments.length,
          days: Object.entries(byDate).sort().map(([date, entries]) => ({
            date,
            dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date + "T12:00:00").getDay()],
            staffCount: entries.length,
            entries,
          })),
        }
      },
    }),

    getWeekCoverage: tool({
      description: "Analyse coverage for a week: staff count per shift per day vs lab minimums. Use this for coverage gap analysis.",
      inputSchema: z.object({
        weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
      }),
      execute: async ({ weekStart }) => {
        const endDate = addDays(weekStart, 6)

        const [assignmentsRes, configRes, shiftTypesRes] = await Promise.all([
          supabase.from("rota_assignments")
            .select("date, shift_type, staff(role)")
            .eq("organisation_id", orgId)
            .gte("date", weekStart)
            .lte("date", endDate),
          supabase.from("lab_config").select("min_lab_coverage, min_weekend_lab_coverage, min_andrology_coverage, min_weekend_andrology").eq("organisation_id", orgId).maybeSingle(),
          supabase.from("shift_types").select("code, name_es, start_time, end_time, active_days").eq("organisation_id", orgId).order("sort_order"),
        ])

        const assignments = (assignmentsRes.data ?? []) as unknown as { date: string; shift_type: string; staff: { role: string } | null }[]
        const config = configRes.data as Record<string, unknown> | null
        const shiftTypes = (shiftTypesRes.data ?? []) as { code: string; name_es: string; start_time: string; end_time: string; active_days: string[] }[]

        const coverage: Record<string, Record<string, { lab: number; andrology: number; total: number }>> = {}
        for (const a of assignments) {
          if (!a.staff) continue
          if (!coverage[a.date]) coverage[a.date] = {}
          if (!coverage[a.date][a.shift_type]) coverage[a.date][a.shift_type] = { lab: 0, andrology: 0, total: 0 }
          coverage[a.date][a.shift_type].total++
          if (a.staff.role === "lab") coverage[a.date][a.shift_type].lab++
          if (a.staff.role === "andrology") coverage[a.date][a.shift_type].andrology++
        }

        return {
          weekStart,
          shiftTypes: shiftTypes.map((s) => ({ code: s.code, name: s.name_es, time: `${s.start_time}-${s.end_time}`, activeDays: s.active_days })),
          minimums: config ? {
            labWeekday: config.min_lab_coverage,
            labWeekend: config.min_weekend_lab_coverage,
            andrologyWeekday: config.min_andrology_coverage,
            andrologyWeekend: config.min_weekend_andrology,
          } : null,
          days: Object.entries(coverage).sort().map(([date, shifts]) => ({
            date,
            isWeekend: [0, 6].includes(new Date(date + "T12:00:00").getDay()),
            shifts,
          })),
        }
      },
    }),

    getStaffList: tool({
      description: "Get all active staff members with roles, skills, working patterns, days per week, and preferred shift.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from("staff")
          .select("id, first_name, last_name, role, onboarding_status, days_per_week, working_pattern, preferred_days, preferred_shift, start_date, staff_skills(skill, level)")
          .eq("organisation_id", orgId)
          .neq("onboarding_status", "inactive")
          .order("last_name") as {
            data: { id: string; first_name: string; last_name: string; role: StaffRole; onboarding_status: string; days_per_week: number; working_pattern: string[]; preferred_days: string[] | null; preferred_shift: string | null; start_date: string; staff_skills: { skill: SkillName; level: string }[] }[] | null
          }

        return (data ?? []).map((s) => ({
          name: `${s.first_name} ${s.last_name}`,
          role: s.role,
          status: s.onboarding_status,
          daysPerWeek: s.days_per_week,
          workingDays: s.working_pattern,
          preferredDays: s.preferred_days,
          preferredShift: s.preferred_shift,
          startDate: s.start_date,
          skills: s.staff_skills.map((sk) => ({
            name: SKILL_LABEL[sk.skill] ?? sk.skill,
            level: sk.level,
          })),
        }))
      },
    }),

    getStaffDetail: tool({
      description: "Get detailed info about a specific staff member including recent assignments and upcoming leaves.",
      inputSchema: z.object({
        staffName: z.string().describe("Full or partial name of the staff member"),
      }),
      execute: async ({ staffName }) => {
        const parts = staffName.trim().split(/\s+/)
        const orClauses = parts.map(p => `first_name.ilike.%${p}%,last_name.ilike.%${p}%`).join(",")

        const { data: staffList } = await supabase
          .from("staff")
          .select("id, first_name, last_name, role, email, days_per_week, working_pattern, preferred_days, preferred_shift, start_date, onboarding_status, notes, staff_skills(skill, level)")
          .eq("organisation_id", orgId)
          .or(orClauses)
          .neq("onboarding_status", "inactive") as {
            data: { id: string; first_name: string; last_name: string; role: string; email: string | null; days_per_week: number; working_pattern: string[]; preferred_days: string[] | null; preferred_shift: string | null; start_date: string; onboarding_status: string; notes: string | null; staff_skills: { skill: string; level: string }[] }[] | null
          }

        if (!staffList?.length) return { error: `No staff found matching "${staffName}"` }

        const staff = staffList[0]
        const today = toISODate()
        const fourWeeksAgoStr = addDays(today, -28)

        const [assignmentsRes, leavesRes] = await Promise.all([
          supabase.from("rota_assignments")
            .select("date, shift_type, function_label")
            .eq("organisation_id", orgId)
            .eq("staff_id", staff.id)
            .gte("date", fourWeeksAgoStr)
            .order("date", { ascending: false })
            .limit(30),
          supabase.from("leaves")
            .select("type, start_date, end_date, status")
            .eq("organisation_id", orgId)
            .eq("staff_id", staff.id)
            .gte("end_date", today)
            .order("start_date"),
        ])

        const recentAssignments = (assignmentsRes.data ?? []) as { date: string; shift_type: string; function_label: string | null }[]
        const assignmentCount = recentAssignments.filter((a) => a.date >= fourWeeksAgoStr).length
        const expected = staff.days_per_week * 4

        return {
          name: `${staff.first_name} ${staff.last_name}`,
          role: staff.role,
          email: staff.email,
          daysPerWeek: staff.days_per_week,
          workingDays: staff.working_pattern,
          preferredDays: staff.preferred_days,
          preferredShift: staff.preferred_shift,
          startDate: staff.start_date,
          notes: staff.notes,
          skills: staff.staff_skills.map((sk) => ({ name: SKILL_LABEL[sk.skill] ?? sk.skill, level: sk.level })),
          last4Weeks: {
            assignments: assignmentCount,
            expected,
            debt: assignmentCount - expected,
          },
          recentShifts: recentAssignments.slice(0, 10).map((a) => ({
            date: a.date,
            shift: a.shift_type,
            function: a.function_label,
          })),
          upcomingLeaves: (leavesRes.data ?? []).map((l) => ({
            type: LEAVE_TYPE_LABEL[(l as { type: string }).type] ?? (l as { type: string }).type,
            from: (l as { start_date: string }).start_date,
            to: (l as { end_date: string }).end_date,
            status: (l as { status: string }).status,
          })),
        }
      },
    }),

    getLeaves: tool({
      description: `Get leaves for a time period. Can filter by staff name. Shows past, current, and future leaves.${viewingWeekStart ? ` IMPORTANT: When checking leaves for "this week", use from=${viewingWeekStart} and to=${viewingWeekEnd}.` : ""}`,
      inputSchema: z.object({
        from: z.string().optional().describe(`Start date YYYY-MM-DD${viewingWeekStart ? ` (use ${viewingWeekStart} for the viewed week)` : " (defaults to today)"}`),
        to: z.string().optional().describe(`End date YYYY-MM-DD${viewingWeekEnd ? ` (use ${viewingWeekEnd} for the viewed week)` : " (defaults to 90 days from now)"}`),
        staffName: z.string().optional().describe("Filter by staff name (partial match)"),
      }),
      execute: async ({ from, to, staffName }) => {
        const fromDate = from ?? toISODate()
        const toDate = to ?? addDays(toISODate(), 90)

        const { data } = await supabase
          .from("leaves")
          .select("id, type, start_date, end_date, status, notes, staff(first_name, last_name)")
          .eq("organisation_id", orgId)
          .lte("start_date", toDate)
          .gte("end_date", fromDate)
          .order("start_date") as {
            data: { id: string; type: string; start_date: string; end_date: string; status: string; notes: string | null; staff: { first_name: string; last_name: string } | null }[] | null
          }

        let leaves = (data ?? []).map((l) => ({
          id: l.id,
          staff: l.staff ? `${l.staff.first_name} ${l.staff.last_name}` : "Unknown",
          type: LEAVE_TYPE_LABEL[l.type] ?? l.type,
          from: l.start_date,
          to: l.end_date,
          status: l.status,
          notes: l.notes,
        }))

        if (staffName) {
          const search = staffName.toLowerCase()
          leaves = leaves.filter((l) => l.staff.toLowerCase().includes(search))
        }

        return { from: fromDate, to: toDate, count: leaves.length, leaves }
      },
    }),

    getLabConfig: tool({
      description: "Get lab configuration: coverage minimums, shift types, rotation mode, biopsy settings, and punctions per day.",
      inputSchema: z.object({}),
      execute: async () => {
        const [configRes, shiftTypesRes] = await Promise.all([
          supabase.from("lab_config").select("*").eq("organisation_id", orgId).maybeSingle(),
          supabase.from("shift_types").select("code, name_es, start_time, end_time, sort_order, active, active_days").eq("organisation_id", orgId).order("sort_order"),
        ])

        const config = configRes.data as Record<string, unknown> | null
        const shifts = (shiftTypesRes.data ?? []) as { code: string; name_es: string; start_time: string; end_time: string; sort_order: number; active: boolean; active_days: string[] }[]

        const pbd = config?.punctions_by_day as PunctionsByDay | null | undefined
        return {
          coverage: config ? {
            labWeekday: config.min_lab_coverage,
            labWeekend: config.min_weekend_lab_coverage,
            andrologyWeekday: config.min_andrology_coverage,
            andrologyWeekend: config.min_weekend_andrology,
          } : null,
          punctions: pbd ? {
            monday: pbd.mon, tuesday: pbd.tue, wednesday: pbd.wed,
            thursday: pbd.thu, friday: pbd.fri, saturday: pbd.sat, sunday: pbd.sun,
          } : null,
          shiftRotation: config?.shift_rotation ?? "stable",
          biopsyConfig: config ? {
            conversionRate: config.biopsy_conversion_rate,
            day5Pct: config.biopsy_day5_pct,
            day6Pct: config.biopsy_day6_pct,
          } : null,
          shiftTypes: shifts.map((s) => ({
            code: s.code,
            name: s.name_es,
            time: `${s.start_time}-${s.end_time}`,
            active: s.active,
            activeDays: s.active_days,
          })),
        }
      },
    }),

    getTechniques: tool({
      description: "Get all techniques/tasks, who can perform them, and their configuration.",
      inputSchema: z.object({}),
      execute: async () => {
        const [tecnicasRes, staffSkillsRes] = await Promise.all([
          supabase.from("tecnicas").select("codigo, nombre_es, department, color, required_skill, typical_shifts, activa").eq("organisation_id", orgId).order("orden"),
          supabase.from("staff_skills").select("skill, level, staff(first_name, last_name)").eq("organisation_id", orgId).order("skill"),
        ])

        const tecnicas = (tecnicasRes.data ?? []) as { codigo: string; nombre_es: string; department: string; color: string; required_skill: string | null; typical_shifts: string[]; activa: boolean }[]
        const staffSkills = (staffSkillsRes.data ?? []) as unknown as { skill: string; level: string; staff: { first_name: string; last_name: string } | null }[]

        const staffBySkill: Record<string, { name: string; level: string }[]> = {}
        for (const ss of staffSkills) {
          if (!ss.staff) continue
          if (!staffBySkill[ss.skill]) staffBySkill[ss.skill] = []
          staffBySkill[ss.skill].push({ name: `${ss.staff.first_name} ${ss.staff.last_name}`, level: ss.level })
        }

        return tecnicas.map((t) => ({
          code: t.codigo,
          name: t.nombre_es,
          department: t.department,
          active: t.activa,
          requiredSkill: t.required_skill,
          typicalShifts: t.typical_shifts,
          qualifiedStaff: staffBySkill[t.codigo] ?? [],
        }))
      },
    }),

    getDepartments: tool({
      description: "Get all departments and sub-departments.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from("departments")
          .select("id, code, name, abbreviation, colour, parent_id, is_default, sort_order")
          .eq("organisation_id", orgId)
          .order("sort_order") as { data: { id: string; code: string; name: string; abbreviation: string; colour: string; parent_id: string | null; is_default: boolean; sort_order: number }[] | null }

        const departments = data ?? []
        const roots = departments.filter((d) => !d.parent_id)
        const subs = departments.filter((d) => d.parent_id)

        return roots.map((root) => ({
          code: root.code,
          name: root.name,
          abbreviation: root.abbreviation,
          isDefault: root.is_default,
          subDepartments: subs.filter((s) => s.parent_id === root.id).map((s) => ({
            code: s.code,
            name: s.name,
            abbreviation: s.abbreviation,
          })),
        }))
      },
    }),

    getRules: tool({
      description: "Get all scheduling rules and constraints configured for the lab. Rules with enabled=false are disabled. staff_ids is empty when the rule applies to everyone.",
      inputSchema: z.object({}),
      execute: async () => {
        const [rulesRes, staffRes] = await Promise.all([
          supabase
            .from("rota_rules")
            .select("id, type, is_hard, enabled, staff_ids, params, notes, expires_at")
            .eq("organisation_id", orgId)
            .order("created_at") as unknown as Promise<{
              data: { id: string; type: string; is_hard: boolean; enabled: boolean; staff_ids: string[]; params: Record<string, unknown>; notes: string | null; expires_at: string | null }[] | null
            }>,
          supabase.from("staff").select("id, first_name, last_name").eq("organisation_id", orgId) as unknown as Promise<{
            data: { id: string; first_name: string; last_name: string }[] | null
          }>,
        ])

        const staffById = Object.fromEntries((staffRes.data ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`]))

        return (rulesRes.data ?? []).map((r) => ({
          type: r.type,
          hard: r.is_hard,
          enabled: r.enabled,
          params: r.params,
          notes: r.notes,
          expiresAt: r.expires_at,
          appliesTo: r.staff_ids.length ? r.staff_ids.map((id) => staffById[id] ?? id) : "all staff",
        }))
      },
    }),

    getSkillMatrix: tool({
      description: "Get a matrix of all staff and their skill levels. Useful for identifying skill gaps and training needs.",
      inputSchema: z.object({}),
      execute: async () => {
        const [staffRes, skillsRes] = await Promise.all([
          supabase.from("staff").select("id, first_name, last_name, role").eq("organisation_id", orgId).neq("onboarding_status", "inactive").order("last_name"),
          supabase.from("staff_skills").select("staff_id, skill, level").eq("organisation_id", orgId),
        ])

        const staff = (staffRes.data ?? []) as { id: string; first_name: string; last_name: string; role: string }[]
        const skills = (skillsRes.data ?? []) as { staff_id: string; skill: string; level: string }[]

        const skillsByStaff: Record<string, Record<string, string>> = {}
        const allSkills = new Set<string>()
        for (const s of skills) {
          if (!skillsByStaff[s.staff_id]) skillsByStaff[s.staff_id] = {}
          skillsByStaff[s.staff_id][s.skill] = s.level
          allSkills.add(s.skill)
        }

        return {
          skills: Array.from(allSkills).sort().map((s) => SKILL_LABEL[s] ?? s),
          staff: staff.map((s) => ({
            name: `${s.first_name} ${s.last_name}`,
            role: s.role,
            skills: Object.fromEntries(
              Array.from(allSkills).sort().map((sk) => [SKILL_LABEL[sk] ?? sk, skillsByStaff[s.id]?.[sk] ?? "none"])
            ),
          })),
        }
      },
    }),
  }
}
