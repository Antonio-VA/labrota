import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, streamText, stepCountIs, UIMessage, tool } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import type { StaffRole, SkillName, PunctionsByDay, LabConfigUpdate } from "@/lib/types/database"
import { propose } from "@/lib/proposal-types"

const SKILL_LABEL: Record<string, string> = {
  icsi: "ICSI", iui: "IUI", vitrification: "Vitrification", thawing: "Thawing",
  biopsy: "Biopsy", semen_analysis: "Semen Analysis", sperm_prep: "Sperm Prep",
  witnessing: "Witnessing", other: "Other",
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Vacaciones", sick: "Baja médica", personal: "Personal",
  training: "Formación", maternity: "Maternidad/Paternidad", other: "Otro",
}

const RULE_TYPE_LABEL: Record<string, string> = {
  no_coincidir: "Cannot work together",
  supervisor_requerido: "Supervisor required",
  max_dias_consecutivos: "Max consecutive days",
  distribucion_fines_semana: "Weekend distribution",
  descanso_fin_de_semana: "Weekend rest",
  no_misma_tarea: "No same task",
  no_librar_mismo_dia: "Cannot have same day off",
  restriccion_dia_tecnica: "Day/technique restriction",
  asignacion_fija: "Fixed assignment",
  tecnicas_juntas: "Techniques together",
  tarea_multidepartamento: "Multi-department task",
  equipo_completo: "Whole team",
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { success } = rateLimit(`chat:${user.id}`, 20) // 20 req/min per user
  if (!success) return rateLimitResponse()

  const { messages, viewingWeekStart, currentPage }: { messages: UIMessage[]; viewingWeekStart?: string; currentPage?: string } = await req.json()

  // Page context — helps the AI understand what the user is looking at
  const pageLabels: Record<string, string> = {
    "/schedule": "Schedule (rota calendar)",
    "/staff": "Team (staff management)",
    "/leaves": "Leave management",
    "/lab": "Lab configuration",
    "/reports": "Reports",
    "/settings": "Settings",
  }
  const pageContext = currentPage
    ? `The user is currently on the ${pageLabels[currentPage] ?? currentPage} page. Prioritise tools and responses relevant to this context.`
    : ""

  // Compute viewed week end (Sunday) if weekStart provided
  let viewingWeekEnd: string | undefined
  if (viewingWeekStart) {
    const d = new Date(viewingWeekStart + "T12:00:00")
    d.setDate(d.getDate() + 6)
    viewingWeekEnd = d.toISOString().split("T")[0]
  }

  const weekContext = viewingWeekStart
    ? `The user is currently viewing the week ${viewingWeekStart} to ${viewingWeekEnd}. CRITICAL: When they say "this week", "the week in view", or ask about the rota/leaves/coverage without specifying a date, ALWAYS use weekStart=${viewingWeekStart} and date range ${viewingWeekStart} to ${viewingWeekEnd}. Do NOT use today's date — use the viewed week.`
    : `If asked about a specific week and no week is mentioned, assume the current week.`

  const systemText = `You are an AI assistant for LabRota — an IVF embryology lab scheduling tool.
You have two modes:

1. SCHEDULING ASSISTANT — manage the rota, staff, leaves, and lab configuration directly (see tools below).
2. PRODUCT GUIDE — answer questions about how LabRota works. If the user asks "how do I…", "what does … do", "where is …", or any question about the app itself, answer from your knowledge of LabRota. Full documentation is at https://docs.labrota.app — mention it when relevant. Never tell the user you cannot answer product questions.

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
- View the skill matrix — who has what skill at what level (getSkillMatrix)

Write (all require user confirmation before executing):
- Generate the rota for a week (proposeGenerateRota)
- Regenerate a single day (proposeRegenerateDay)
- Copy previous week's rota (proposeCopyPreviousWeek)
- Assign a specific person to a shift on a day (proposeAssignStaff)
- Publish a draft rota (proposePublishRota)
- Unlock a published rota back to draft (proposeUnlockRota)
- Add leave for a staff member (proposeAddLeave)
- Add a note/summary to a week (proposeAddNote)
- Update a staff member's details (proposeUpdateStaff)
- Add a skill to a staff member (proposeAddSkill)
- Remove a skill from a staff member (proposeRemoveSkill)
- Deactivate a staff member (proposeDeactivateStaff)
- Update lab coverage requirements (proposeUpdateCoverage)
- Create a scheduling rule (proposeCreateRule)
- Enable or disable a scheduling rule (proposeToggleRule)
- Delete a scheduling rule (proposeDeleteRule)
- Approve a pending leave request (proposeApproveLeave)
- Reject a pending leave request (proposeRejectLeave)
- Cancel a leave (proposeCancelLeave)

Never tell the user to go elsewhere for anything listed above. Use the tools and handle it.

Guidelines:
- Be concise and professional. Write like a knowledgeable colleague, not a chatbot.
- Never use emojis in any response.
- Use real staff names in responses.
- For ALL write operations, use the propose tools. These create a confirmation card the user must click to execute.
- CRITICAL: After calling a propose tool, tell the user "I've prepared this for you — please confirm using the button below." NEVER say "done", "created", "added", or "I've made the change". The action has NOT happened until the user clicks Apply.
- If the propose tool returns an error field instead of a proposal, tell the user about the error.
- When discussing skill gaps, name the missing skills clearly.
- ${weekContext}
${pageContext ? `- ${pageContext}` : ""}
- When analysing coverage, compare actual staff per shift against lab minimums.
- IMPORTANT: Always use your read tools (getWeekRota, getWeekCoverage, etc.) to fetch actual data before answering questions about the rota. Never guess or assume what the rota contains. Even if you just proposed generating a rota and the user confirmed it, you MUST call getWeekRota or getWeekCoverage to see the actual results — your propose tools do not return rota data.
- Dates in tool parameters use ISO format (YYYY-MM-DD), but when DISPLAYING dates to the user, always use a readable format like "Mon 4 May 2026" or "4–10 May 2026". Never show raw ISO dates in your text responses.
- The current date is ${new Date().toISOString().split("T")[0]}.`

  try {
  const result = streamText({
    model: anthropic("claude-sonnet-4.6"),
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
            supabase.from("lab_config").select("*").single(),
            supabase.from("shift_types").select("code, name_es, start_time, end_time, active_days").order("sort_order"),
          ])

          const assignments = (assignmentsRes.data ?? []) as unknown as { date: string; shift_type: string; staff: { role: string } | null }[]
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
          // Search each word against both first_name and last_name
          const orClauses = parts.map(p => `first_name.ilike.%${p}%,last_name.ilike.%${p}%`).join(",")

          const { data: staffList } = await supabase
            .from("staff")
            .select("id, first_name, last_name, role, email, days_per_week, working_pattern, preferred_days, preferred_shift, start_date, onboarding_status, notes, staff_skills(skill, level)")
            .or(orClauses)
            .neq("onboarding_status", "inactive") as {
              data: { id: string; first_name: string; last_name: string; role: string; email: string | null; days_per_week: number; working_pattern: string[]; preferred_days: string[] | null; preferred_shift: string | null; start_date: string; onboarding_status: string; notes: string | null; staff_skills: { skill: string; level: string }[] }[] | null
            }

          if (!staffList?.length) return { error: `No staff found matching "${staffName}"` }

          const staff = staffList[0]
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
        description: `Get leaves for a time period. Can filter by staff name. Shows past, current, and future leaves.${viewingWeekStart ? ` IMPORTANT: When checking leaves for "this week", use from=${viewingWeekStart} and to=${viewingWeekEnd}.` : ""}`,
        inputSchema: z.object({
          from: z.string().optional().describe(`Start date YYYY-MM-DD${viewingWeekStart ? ` (use ${viewingWeekStart} for the viewed week)` : " (defaults to today)"}`),
          to: z.string().optional().describe(`End date YYYY-MM-DD${viewingWeekEnd ? ` (use ${viewingWeekEnd} for the viewed week)` : " (defaults to 90 days from now)"}`),
          staffName: z.string().optional().describe("Filter by staff name (partial match)"),
        }),
        execute: async ({ from, to, staffName }) => {
          const fromDate = from ?? new Date().toISOString().split("T")[0]
          const toDate = to ?? (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().split("T")[0] })()

          const query = supabase
            .from("leaves")
            .select("id, type, start_date, end_date, status, notes, staff(first_name, last_name)")
            .lte("start_date", toDate)
            .gte("end_date", fromDate)
            .order("start_date")

          const { data } = await query as {
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
            supabase.from("lab_config").select("*").single(),
            supabase.from("shift_types").select("code, name_es, start_time, end_time, sort_order, active, active_days").order("sort_order"),
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
            supabase.from("tecnicas").select("codigo, nombre_es, department, color, required_skill, typical_shifts, activa").order("orden"),
            supabase.from("staff_skills").select("skill, level, staff(first_name, last_name)").order("skill"),
          ])

          const tecnicas = (tecnicasRes.data ?? []) as { codigo: string; nombre_es: string; department: string; color: string; required_skill: string | null; typical_shifts: string[]; activa: boolean }[]
          const staffSkills = (staffSkillsRes.data ?? []) as unknown as { skill: string; level: string; staff: { first_name: string; last_name: string } | null }[]

          // Group staff by skill
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
        execute: async ({ weekStart, reason }) =>
          propose("generateRota", { weekStart }, reason ?? `Generate rota for week of ${weekStart}`),
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

          return propose(
            "addLeave",
            {
              staffId: staff.id,
              staffName: `${staff.first_name} ${staff.last_name}`,
              leaveType: params.leaveType,
              startDate: params.startDate,
              endDate: params.endDate,
              notes: params.notes ?? null,
            },
            `Add ${LEAVE_TYPE_LABEL[params.leaveType] ?? params.leaveType} for ${params.staffName}: ${params.startDate} – ${params.endDate}`,
          )
        },
      }),

      proposeAddNote: tool({
        description: "Propose adding a note/summary to a specific week. Use for weekly summaries, reminders, or observations. The user must confirm.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
          text: z.string().describe("The note text to add"),
        }),
        execute: async ({ weekStart, text }) =>
          propose("addNote", { weekStart, text }, `Add note to week of ${weekStart}: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`),
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

          if (!staff) return { error: `Staff member "${staffName}" not found.` }

          // Compute weekStart (Monday of that week)
          const d = new Date(date + "T12:00:00")
          const day = d.getDay()
          const diff = day === 0 ? -6 : 1 - day
          d.setDate(d.getDate() + diff)
          const weekStart = d.toISOString().split("T")[0]

          const resolvedName = `${staff.first_name} ${staff.last_name}`
          return propose(
            "assignStaff",
            { weekStart, staffId: staff.id, date, shiftType, functionLabel: functionLabel ?? null },
            `Assign ${resolvedName} to ${shiftType} on ${date}${functionLabel ? ` (${functionLabel})` : ""}`,
          )
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

          return propose("regenerateDay", { weekStart, date }, `Regenerate rota for ${date}`)
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

          return propose("publishRota", { rotaId: rota.id }, `Publish rota for week of ${weekStart}`)
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

          return propose("unlockRota", { rotaId: rota.id }, `Unlock rota for week of ${weekStart} (back to draft)`)
        },
      }),

      proposeCopyPreviousWeek: tool({
        description: "Propose copying the previous week's rota to a new week. Respects current leaves. The user must confirm.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD of the target week to fill"),
        }),
        execute: async ({ weekStart }) =>
          propose("copyPreviousWeek", { weekStart }, `Copy previous week's rota to week of ${weekStart}`),
      }),

      // ── New read tools ──────────────────────────────────────────────────────────

      getSkillMatrix: tool({
        description: "Get a matrix of all staff and their skill levels. Useful for identifying skill gaps and training needs.",
        inputSchema: z.object({}),
        execute: async () => {
          const [staffRes, skillsRes] = await Promise.all([
            supabase.from("staff").select("id, first_name, last_name, role").neq("onboarding_status", "inactive").order("last_name"),
            supabase.from("staff_skills").select("staff_id, skill, level"),
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

      // ── New propose tools ───────────────────────────────────────────────────────

      proposeUpdateStaff: tool({
        description: "Propose updating a staff member's details (days per week, working pattern, preferred shift, notes, onboarding status). The user must confirm.",
        inputSchema: z.object({
          staffName: z.string().describe("Full or partial name of the staff member"),
          daysPerWeek: z.number().optional().describe("Number of days per week (1-7)"),
          workingPattern: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional().describe("Days the staff member works"),
          preferredShift: z.string().optional().describe("Preferred shift code (e.g. T1, T2)"),
          notes: z.string().optional().describe("Notes about the staff member"),
          onboardingStatus: z.enum(["active", "training", "certified", "inactive"]).optional(),
        }),
        execute: async ({ staffName, ...updates }) => {
          const nameParts = staffName.trim().split(" ")
          const { data: staffList } = await supabase
            .from("staff")
            .select("id, first_name, last_name")
            .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
            .neq("onboarding_status", "inactive")
            .limit(1) as { data: { id: string; first_name: string; last_name: string }[] | null }

          if (!staffList?.length) return { error: `Staff member "${staffName}" not found.` }
          const staff = staffList[0]

          const changes: Record<string, unknown> = {}
          if (updates.daysPerWeek !== undefined) changes.days_per_week = updates.daysPerWeek
          if (updates.workingPattern !== undefined) changes.working_pattern = updates.workingPattern
          if (updates.preferredShift !== undefined) changes.preferred_shift = updates.preferredShift
          if (updates.notes !== undefined) changes.notes = updates.notes
          if (updates.onboardingStatus !== undefined) changes.onboarding_status = updates.onboardingStatus

          if (Object.keys(changes).length === 0) return { error: "No changes specified." }

          const desc = Object.entries(changes).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(", ")
          return propose(
            "updateStaff",
            { staffId: staff.id, staffName: `${staff.first_name} ${staff.last_name}`, changes },
            `Update ${staff.first_name} ${staff.last_name}: ${desc}`,
          )
        },
      }),

      proposeAddSkill: tool({
        description: "Propose adding a skill to a staff member. The user must confirm.",
        inputSchema: z.object({
          staffName: z.string().describe("Full or partial name of the staff member"),
          skill: z.enum(["icsi", "iui", "vitrification", "thawing", "biopsy", "semen_analysis", "sperm_prep", "witnessing", "other"]),
          level: z.enum(["certified", "training"]).describe("Skill level"),
        }),
        execute: async ({ staffName, skill, level }) => {
          const nameParts = staffName.trim().split(" ")
          const { data: staffList } = await supabase
            .from("staff")
            .select("id, first_name, last_name")
            .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
            .neq("onboarding_status", "inactive")
            .limit(1) as { data: { id: string; first_name: string; last_name: string }[] | null }

          if (!staffList?.length) return { error: `Staff member "${staffName}" not found.` }
          const staff = staffList[0]

          return propose(
            "addSkill",
            { staffId: staff.id, staffName: `${staff.first_name} ${staff.last_name}`, skill, level },
            `Add ${SKILL_LABEL[skill] ?? skill} (${level}) to ${staff.first_name} ${staff.last_name}`,
          )
        },
      }),

      proposeRemoveSkill: tool({
        description: "Propose removing a skill from a staff member. The user must confirm.",
        inputSchema: z.object({
          staffName: z.string().describe("Full or partial name of the staff member"),
          skill: z.enum(["icsi", "iui", "vitrification", "thawing", "biopsy", "semen_analysis", "sperm_prep", "witnessing", "other"]),
        }),
        execute: async ({ staffName, skill }) => {
          const nameParts = staffName.trim().split(" ")
          const { data: staffList } = await supabase
            .from("staff")
            .select("id, first_name, last_name")
            .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
            .neq("onboarding_status", "inactive")
            .limit(1) as { data: { id: string; first_name: string; last_name: string }[] | null }

          if (!staffList?.length) return { error: `Staff member "${staffName}" not found.` }
          const staff = staffList[0]

          return propose(
            "removeSkill",
            { staffId: staff.id, staffName: `${staff.first_name} ${staff.last_name}`, skill },
            `Remove ${SKILL_LABEL[skill] ?? skill} from ${staff.first_name} ${staff.last_name}`,
          )
        },
      }),

      proposeDeactivateStaff: tool({
        description: "Propose deactivating a staff member (sets them as inactive with end date today). The user must confirm.",
        inputSchema: z.object({
          staffName: z.string().describe("Full or partial name of the staff member"),
          reason: z.string().optional().describe("Reason for deactivation"),
        }),
        execute: async ({ staffName, reason }) => {
          const nameParts = staffName.trim().split(" ")
          const { data: staffList } = await supabase
            .from("staff")
            .select("id, first_name, last_name")
            .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
            .neq("onboarding_status", "inactive")
            .limit(1) as { data: { id: string; first_name: string; last_name: string }[] | null }

          if (!staffList?.length) return { error: `Staff member "${staffName}" not found.` }
          const staff = staffList[0]

          return propose(
            "deactivateStaff",
            { staffId: staff.id, staffName: `${staff.first_name} ${staff.last_name}` },
            `Deactivate ${staff.first_name} ${staff.last_name}${reason ? ` (${reason})` : ""}`,
          )
        },
      }),

      proposeUpdateCoverage: tool({
        description: "Propose updating lab coverage requirements (minimum staff per shift for weekdays and weekends). The user must confirm.",
        inputSchema: z.object({
          labWeekday: z.number().optional().describe("Minimum lab staff on weekdays"),
          labWeekend: z.number().optional().describe("Minimum lab staff on weekends"),
          andrologyWeekday: z.number().optional().describe("Minimum andrology staff on weekdays"),
          andrologyWeekend: z.number().optional().describe("Minimum andrology staff on weekends"),
        }),
        execute: async ({ labWeekday, labWeekend, andrologyWeekday, andrologyWeekend }) => {
          const changes: LabConfigUpdate = {}
          if (labWeekday !== undefined) changes.min_lab_coverage = labWeekday
          if (labWeekend !== undefined) changes.min_weekend_lab_coverage = labWeekend
          if (andrologyWeekday !== undefined) changes.min_andrology_coverage = andrologyWeekday
          if (andrologyWeekend !== undefined) changes.min_weekend_andrology = andrologyWeekend

          if (Object.keys(changes).length === 0) return { error: "No changes specified." }

          const desc = Object.entries(changes).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ")
          return propose("updateCoverage", changes, `Update coverage: ${desc}`)
        },
      }),

      proposeCreateRule: tool({
        description: "Propose creating a new scheduling rule. The user must confirm.",
        inputSchema: z.object({
          type: z.enum([
            "no_coincidir", "supervisor_requerido", "max_dias_consecutivos",
            "distribucion_fines_semana", "descanso_fin_de_semana", "no_misma_tarea",
            "no_librar_mismo_dia", "restriccion_dia_tecnica", "asignacion_fija",
            "tecnicas_juntas", "tarea_multidepartamento", "equipo_completo",
          ]).describe("Rule type"),
          isHard: z.boolean().optional().describe("Whether this is a hard constraint (cannot be violated) or soft (preference). Defaults to true."),
          notes: z.string().optional().describe("Description or notes for the rule"),
          staffNames: z.array(z.string()).optional().describe("Staff member names this rule applies to (omit for all staff)"),
          params: z.record(z.string(), z.unknown()).optional().describe("Rule-specific parameters"),
        }),
        execute: async ({ type, isHard, notes, staffNames, params: ruleParams }) => {
          // Resolve staff IDs if names provided
          const staffIds: string[] = []
          if (staffNames?.length) {
            for (const name of staffNames) {
              const parts = name.trim().split(" ")
              const { data } = await supabase
                .from("staff")
                .select("id, first_name, last_name")
                .ilike("last_name", `%${parts[parts.length - 1]}%`)
                .neq("onboarding_status", "inactive")
                .limit(1) as { data: { id: string; first_name: string; last_name: string }[] | null }
              if (data?.[0]) staffIds.push(data[0].id)
            }
          }

          return propose(
            "createRule",
            {
              type,
              is_hard: isHard ?? true,
              enabled: true,
              staff_ids: staffIds,
              params: ruleParams ?? {},
              notes: notes ?? null,
              expires_at: null,
            },
            `Create rule: ${RULE_TYPE_LABEL[type] ?? type}${notes ? ` — ${notes}` : ""}`,
          )
        },
      }),

      proposeToggleRule: tool({
        description: "Propose enabling or disabling an existing scheduling rule. Use getRules first to find the rule. The user must confirm.",
        inputSchema: z.object({
          ruleId: z.string().describe("ID of the rule to toggle"),
          enabled: z.boolean().describe("Whether to enable (true) or disable (false) the rule"),
          ruleDescription: z.string().optional().describe("Brief description of the rule for the confirmation card"),
        }),
        execute: async ({ ruleId, enabled, ruleDescription }) =>
          propose("toggleRule", { ruleId, enabled }, `${enabled ? "Enable" : "Disable"} rule${ruleDescription ? `: ${ruleDescription}` : ""}`),
      }),

      proposeDeleteRule: tool({
        description: "Propose deleting a scheduling rule. Use getRules first to find the rule. The user must confirm.",
        inputSchema: z.object({
          ruleId: z.string().describe("ID of the rule to delete"),
          ruleDescription: z.string().optional().describe("Brief description of the rule for the confirmation card"),
        }),
        execute: async ({ ruleId, ruleDescription }) =>
          propose("deleteRule", { ruleId }, `Delete rule${ruleDescription ? `: ${ruleDescription}` : ""}`),
      }),

      proposeApproveLeave: tool({
        description: "Propose approving a pending leave request. Use getLeaves first to find the leave. The user must confirm.",
        inputSchema: z.object({
          leaveId: z.string().describe("ID of the leave to approve"),
          staffName: z.string().describe("Staff member name for the confirmation card"),
          dates: z.string().describe("Date range for the confirmation card"),
        }),
        execute: async ({ leaveId, staffName, dates }) =>
          propose("approveLeave", { leaveId }, `Approve leave for ${staffName}: ${dates}`),
      }),

      proposeRejectLeave: tool({
        description: "Propose rejecting a pending leave request. Use getLeaves first to find the leave. The user must confirm.",
        inputSchema: z.object({
          leaveId: z.string().describe("ID of the leave to reject"),
          staffName: z.string().describe("Staff member name for the confirmation card"),
          dates: z.string().describe("Date range for the confirmation card"),
        }),
        execute: async ({ leaveId, staffName, dates }) =>
          propose("rejectLeave", { leaveId }, `Reject leave for ${staffName}: ${dates}`),
      }),

      proposeCancelLeave: tool({
        description: "Propose cancelling an existing leave (approved or pending). Use getLeaves first to find the leave. The user must confirm.",
        inputSchema: z.object({
          leaveId: z.string().describe("ID of the leave to cancel"),
          staffName: z.string().describe("Staff member name for the confirmation card"),
          dates: z.string().describe("Date range for the confirmation card"),
        }),
        execute: async ({ leaveId, staffName, dates }) =>
          propose("cancelLeave", { leaveId }, `Cancel leave for ${staffName}: ${dates}`),
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
