import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, streamText, stepCountIs, UIMessage, tool } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getCachedOrgId } from "@/lib/auth-cache"
import { getCachedOrgContext } from "@/lib/org-context-cache"
import type { StaffRole, SkillName } from "@/lib/types/database"

const SKILL_LABEL: Record<string, string> = {
  icsi: "ICSI", iui: "IUI", vitrification: "Vitrification", thawing: "Thawing",
  biopsy: "Biopsy", semen_analysis: "Semen Analysis", sperm_prep: "Sperm Prep",
  witnessing: "Witnessing", other: "Other",
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Vacaciones", sick: "Baja médica", personal: "Personal",
  training: "Formación", maternity: "Maternidad/Paternidad", other: "Otro",
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  const ctx = orgId ? await getCachedOrgContext(orgId) : null

  const systemText = `You are an AI scheduling assistant for an embryology IVF lab.
You help managers understand the rota, staff availability, coverage, and lab configuration.

Capabilities — you can do all of the following directly:

Read:
- Look up the rota for any week with shift details (getWeekRota)
- Get detailed rota with coverage analysis per shift (getWeekCoverage)
- List all active staff with skills, working patterns, and preferences (getStaffList)
- Get detailed info about a specific staff member (getStaffDetail)
- Show leaves — upcoming, past, or for a specific period (getLeaves)
- View lab configuration (shift types, coverage requirements) (getLabConfig)
- View techniques/tasks and who can perform them (getTechniques)
- View departments and sub-departments (getDepartments)
- View scheduling rules and constraints (getRules)

Write (all require user confirmation before executing):
- Generate the rota for a week (proposeGenerateRota)
- Regenerate a single day (proposeRegenerateDay)
- Copy previous week's rota (proposeCopyPreviousWeek)
- Assign a specific person to a shift on a day (proposeAssignStaff)
- Publish a draft rota (proposePublishRota)
- Unlock a published rota back to draft (proposeUnlockRota)
- Add leave for a staff member (proposeAddLeave)
- Add a note/summary to a week (proposeAddNote)

Never tell the user to go elsewhere for anything listed above. Use the tools and handle it.

Guidelines:
- Be concise and professional. Write like a knowledgeable colleague, not a chatbot.
- Never use emojis in any response.
- Use real staff names in responses.
- For ALL write operations, use the propose tools. These create a confirmation card the user must click to execute.
- CRITICAL: After calling a propose tool, tell the user "I've prepared this for you — please confirm using the button below." NEVER say "done", "created", "added", or "I've made the change". The action has NOT happened until the user clicks Apply.
- If the propose tool returns an error field instead of a proposal, tell the user about the error.
- When discussing skill gaps, name the missing skills clearly.
- If asked about a specific week and no week is mentioned, assume the current week.
- When analysing coverage, compare actual staff per shift against lab minimums.
- Dates are ISO format (YYYY-MM-DD). The current date is ${new Date().toISOString().split("T")[0]}.`

  try {
  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemText,
    abortSignal: AbortSignal.timeout(30_000),
    messages: await convertToModelMessages(messages),
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
    stopWhen: stepCountIs(5),
    tools: {

      // ── Read tools ───────────────────────────────────────────────────────────

      getWeekRota: tool({
        description: "Get the rota assignments for a specific week. Returns staff assigned per day with shift types and function labels.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
        }),
        execute: async ({ weekStart }) => {
          const endDate = (() => {
            const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().split("T")[0]
          })()

          const { data: assignments } = await supabase
            .from("rota_assignments")
            .select("date, shift_type, function_label, is_manual_override, staff(first_name, last_name, role)")
            .gte("date", weekStart)
            .lte("date", endDate) as { data: { date: string; shift_type: string; function_label: string | null; is_manual_override: boolean; staff: { first_name: string; last_name: string; role: string } | null }[] | null }

          const { data: rota } = await supabase
            .from("rotas")
            .select("status, published_at")
            .eq("week_start", weekStart)
            .maybeSingle() as { data: { status: string; published_at: string | null } | null }

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
          const endDate = (() => {
            const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().split("T")[0]
          })()

          const [assignmentsRes, configRes, shiftTypesRes] = await Promise.all([
            supabase.from("rota_assignments")
              .select("date, shift_type, staff(role)")
              .gte("date", weekStart)
              .lte("date", endDate),
            supabase.from("lab_config").select("min_lab_coverage, min_weekend_lab_coverage, min_andrology_coverage, min_weekend_andrology").single(),
            supabase.from("shift_types").select("code, name_es, start_time, end_time, active_days").order("sort_order"),
          ])

          const assignments = (assignmentsRes.data ?? []) as { date: string; shift_type: string; staff: { role: string } | null }[]
          const config = configRes.data as Record<string, unknown> | null
          const shiftTypes = (shiftTypesRes.data ?? []) as { code: string; name_es: string; start_time: string; end_time: string; active_days: string[] }[]

          // Build coverage per day per shift
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
              labWeekend: config.min_weekend_lab,
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
          const staffList = (ctx?.staff ?? []).filter((s) => s.onboarding_status !== "inactive")
            .sort((a, b) => a.last_name.localeCompare(b.last_name))
          const skillsByStaff: Record<string, { skill: string; level: string }[]> = {}
          for (const ss of ctx?.staffSkills ?? []) {
            if (!skillsByStaff[ss.staff_id]) skillsByStaff[ss.staff_id] = []
            skillsByStaff[ss.staff_id].push({ skill: ss.skill, level: ss.level })
          }
          return staffList.map((s) => ({
            name: `${s.first_name} ${s.last_name}`,
            role: s.role,
            status: s.onboarding_status,
            daysPerWeek: s.days_per_week,
            workingDays: s.working_pattern,
            preferredDays: s.preferred_days,
            preferredShift: s.preferred_shift,
            startDate: s.start_date,
            skills: (skillsByStaff[s.id] ?? []).map((sk) => ({
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
          const searchTerm = staffName.trim().toLowerCase()
          const match = (ctx?.staff ?? [])
            .filter((s) => s.onboarding_status !== "inactive")
            .find((s) =>
              `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchTerm) ||
              s.last_name.toLowerCase().includes(searchTerm)
            )

          if (!match) return { error: `No staff found matching "${staffName}"` }

          const skillsByStaff: Record<string, { skill: string; level: string }[]> = {}
          for (const ss of ctx?.staffSkills ?? []) {
            if (!skillsByStaff[ss.staff_id]) skillsByStaff[ss.staff_id] = []
            skillsByStaff[ss.staff_id].push({ skill: ss.skill, level: ss.level })
          }
          const staff = { ...match, staff_skills: skillsByStaff[match.id] ?? [] }
          const today = new Date().toISOString().split("T")[0]
          const fourWeeksAgo = new Date(); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
          const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0]

          const [assignmentsRes, leavesRes] = await Promise.all([
            supabase.from("rota_assignments")
              .select("date, shift_type, function_label")
              .eq("staff_id", staff.id)
              .gte("date", fourWeeksAgoStr)
              .order("date", { ascending: false })
              .limit(30),
            supabase.from("leaves")
              .select("type, start_date, end_date, status")
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
        description: "Get leaves for a time period. Can filter by staff name. Shows past, current, and future leaves.",
        inputSchema: z.object({
          from: z.string().optional().describe("Start date YYYY-MM-DD (defaults to today)"),
          to: z.string().optional().describe("End date YYYY-MM-DD (defaults to 90 days from now)"),
          staffName: z.string().optional().describe("Filter by staff name (partial match)"),
        }),
        execute: async ({ from, to, staffName }) => {
          const fromDate = from ?? new Date().toISOString().split("T")[0]
          const toDate = to ?? (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().split("T")[0] })()

          let query = supabase
            .from("leaves")
            .select("type, start_date, end_date, status, notes, staff(first_name, last_name)")
            .lte("start_date", toDate)
            .gte("end_date", fromDate)
            .order("start_date")

          const { data } = await query as {
            data: { type: string; start_date: string; end_date: string; status: string; notes: string | null; staff: { first_name: string; last_name: string } | null }[] | null
          }

          let leaves = (data ?? []).map((l) => ({
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
          const config = ctx?.labConfig as Record<string, unknown> | null
          const shifts = ctx?.shiftTypes ?? []
          return {
            coverage: config ? {
              labWeekday: config.min_lab_coverage,
              labWeekend: config.min_weekend_lab,
              andrologyWeekday: config.min_andrology_coverage,
              andrologyWeekend: config.min_weekend_andrology,
            } : null,
            punctions: config?.punctions_by_day ?? null,
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
          const tecnicas = ctx?.tecnicas ?? []
          const staffNameMap = Object.fromEntries((ctx?.staff ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`]))
          // Group staff by skill using cached data
          const staffBySkill: Record<string, { name: string; level: string }[]> = {}
          for (const ss of ctx?.staffSkills ?? []) {
            const name = staffNameMap[ss.staff_id]
            if (!name) continue
            if (!staffBySkill[ss.skill]) staffBySkill[ss.skill] = []
            staffBySkill[ss.skill].push({ name, level: ss.level })
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
          const departments = ctx?.departments ?? []
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
        description: "Get all scheduling rules and constraints configured for the lab.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await supabase
            .from("rota_rules")
            .select("id, type, config, description, active, staff(first_name, last_name)")
            .order("created_at") as {
              data: { id: string; type: string; config: Record<string, unknown>; description: string | null; active: boolean; staff: { first_name: string; last_name: string } | null }[] | null
            }

          return (data ?? []).map((r) => ({
            type: r.type,
            description: r.description,
            active: r.active,
            config: r.config,
            appliesTo: r.staff ? `${r.staff.first_name} ${r.staff.last_name}` : "All staff",
          }))
        },
      }),

      // ── Propose tools (draft-confirm pattern) ─────────────────────────────────

      proposeGenerateRota: tool({
        description: "Propose generating the rota for a specific week. The user must confirm before it executes.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
          reason: z.string().optional().describe("Brief reason or context for the proposal"),
        }),
        execute: async ({ weekStart, reason }) => ({
          proposal: true,
          action: "generateRota" as const,
          params: { weekStart },
          description: reason ?? `Generate rota for week of ${weekStart}`,
        }),
      }),

      proposeAddLeave: tool({
        description: "Propose adding leave for a staff member. The user must confirm before it saves.",
        inputSchema: z.object({
          staffName: z.string().describe("Full name of the staff member"),
          leaveType: z.enum(["annual", "sick", "personal", "training", "maternity", "other"]),
          startDate: z.string().describe("ISO date YYYY-MM-DD"),
          endDate: z.string().describe("ISO date YYYY-MM-DD"),
          notes: z.string().optional(),
        }),
        execute: async (params) => {
          // Resolve staff ID — try first+last name, then last name only
          const nameParts = params.staffName.trim().split(" ")
          let staff: { id: string; first_name: string; last_name: string } | null = null
          if (nameParts.length >= 2) {
            const { data } = await supabase
              .from("staff")
              .select("id, first_name, last_name")
              .ilike("first_name", `%${nameParts[0]}%`)
              .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
              .limit(1) as { data: { id: string; first_name: string; last_name: string }[] | null }
            staff = data?.[0] ?? null
          }
          if (!staff) {
            const { data } = await supabase
              .from("staff")
              .select("id, first_name, last_name")
              .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
              .limit(1) as { data: { id: string; first_name: string; last_name: string }[] | null }
            staff = data?.[0] ?? null
          }

          if (!staff) {
            return { error: `Staff member "${params.staffName}" not found. Check the name and try again.` }
          }

          return {
            proposal: true,
            action: "addLeave" as const,
            params: {
              staffId: staff.id,
              staffName: `${staff.first_name} ${staff.last_name}`,
              leaveType: params.leaveType,
              startDate: params.startDate,
              endDate: params.endDate,
              notes: params.notes ?? null,
            },
            description: `Add ${LEAVE_TYPE_LABEL[params.leaveType] ?? params.leaveType} for ${params.staffName}: ${params.startDate} – ${params.endDate}`,
          }
        },
      }),

      proposeAddNote: tool({
        description: "Propose adding a note/summary to a specific week. Use for weekly summaries, reminders, or observations. The user must confirm.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
          text: z.string().describe("The note text to add"),
        }),
        execute: async ({ weekStart, text }) => ({
          proposal: true,
          action: "addNote",
          params: { weekStart, text },
          description: `Add note to week of ${weekStart}: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`,
        }),
      }),

      proposeAssignStaff: tool({
        description: "Propose assigning a staff member to a specific shift on a specific day. The user must confirm.",
        inputSchema: z.object({
          staffName: z.string().describe("Full name of the staff member"),
          date: z.string().describe("ISO date YYYY-MM-DD"),
          shiftType: z.string().describe("Shift code (e.g. T1, T2, T3)"),
          functionLabel: z.string().optional().describe("Optional function/department label"),
        }),
        execute: async ({ staffName, date, shiftType, functionLabel }) => {
          const nameParts = staffName.trim().split(" ")
          const { data: staff } = await supabase
            .from("staff")
            .select("id, first_name, last_name")
            .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
            .maybeSingle() as { data: { id: string; first_name: string; last_name: string } | null }

          // Compute weekStart (Monday of that week)
          const d = new Date(date + "T12:00:00")
          const day = d.getDay()
          const diff = day === 0 ? -6 : 1 - day
          d.setDate(d.getDate() + diff)
          const weekStart = d.toISOString().split("T")[0]

          const resolvedName = staff ? `${staff.first_name} ${staff.last_name}` : staffName
          return {
            proposal: true,
            action: "assignStaff",
            params: { weekStart, staffId: staff?.id ?? null, date, shiftType, functionLabel: functionLabel ?? null },
            description: `Assign ${resolvedName} to ${shiftType} on ${date}${functionLabel ? ` (${functionLabel})` : ""}`,
          }
        },
      }),

      proposeRegenerateDay: tool({
        description: "Propose regenerating the rota for a single day (re-runs the scheduling engine for that day only). The user must confirm.",
        inputSchema: z.object({
          date: z.string().describe("ISO date YYYY-MM-DD to regenerate"),
        }),
        execute: async ({ date }) => {
          const d = new Date(date + "T12:00:00")
          const day = d.getDay()
          const diff = day === 0 ? -6 : 1 - day
          d.setDate(d.getDate() + diff)
          const weekStart = d.toISOString().split("T")[0]

          return {
            proposal: true,
            action: "regenerateDay",
            params: { weekStart, date },
            description: `Regenerate rota for ${date}`,
          }
        },
      }),

      proposePublishRota: tool({
        description: "Propose publishing a draft rota to make it visible to all staff. The user must confirm.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
        }),
        execute: async ({ weekStart }) => {
          const { data: rota } = await supabase
            .from("rotas")
            .select("id, status")
            .eq("week_start", weekStart)
            .maybeSingle() as { data: { id: string; status: string } | null }

          if (!rota) return { error: `No rota found for week of ${weekStart}` }
          if (rota.status === "published") return { error: `Rota for ${weekStart} is already published` }

          return {
            proposal: true,
            action: "publishRota",
            params: { rotaId: rota.id },
            description: `Publish rota for week of ${weekStart}`,
          }
        },
      }),

      proposeUnlockRota: tool({
        description: "Propose unlocking a published rota back to draft so it can be edited. The user must confirm.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
        }),
        execute: async ({ weekStart }) => {
          const { data: rota } = await supabase
            .from("rotas")
            .select("id, status")
            .eq("week_start", weekStart)
            .maybeSingle() as { data: { id: string; status: string } | null }

          if (!rota) return { error: `No rota found for week of ${weekStart}` }
          if (rota.status !== "published") return { error: `Rota for ${weekStart} is not published` }

          return {
            proposal: true,
            action: "unlockRota",
            params: { rotaId: rota.id },
            description: `Unlock rota for week of ${weekStart} (back to draft)`,
          }
        },
      }),

      proposeCopyPreviousWeek: tool({
        description: "Propose copying the previous week's rota to a new week. Respects current leaves. The user must confirm.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD of the target week to fill"),
        }),
        execute: async ({ weekStart }) => ({
          proposal: true,
          action: "copyPreviousWeek",
          params: { weekStart },
          description: `Copy previous week's rota to week of ${weekStart}`,
        }),
      }),
    },
  })

  return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[chat] streamText error:", error)
    return new Response(JSON.stringify({ error: "AI service unavailable. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
