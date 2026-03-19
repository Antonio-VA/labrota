import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, streamText, stepCountIs, UIMessage, tool } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import type { StaffRole, SkillName } from "@/lib/types/database"

const SKILL_LABEL: Record<string, string> = {
  icsi: "ICSI", iui: "IUI", vitrification: "Vitrification", thawing: "Thawing",
  biopsy: "Biopsy", semen_analysis: "Semen Analysis", sperm_prep: "Sperm Prep",
  witnessing: "Witnessing", other: "Other",
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const supabase = await createClient()

  const systemText = `You are an AI scheduling assistant for an embryology IVF lab.
You help managers understand the rota, staff availability, and coverage.

Guidelines:
- Be concise and practical. Use real staff names in responses.
- For write operations (generate rota, add leave), always use the propose tools — never claim to have made changes directly. The user must confirm before anything is saved.
- When discussing skill gaps, name the missing skills clearly.
- If asked about a specific week and no week is mentioned, assume the current week.
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
        description: "Get the rota assignments for a specific week. Returns staff assigned per day.",
        inputSchema: z.object({
          weekStart: z.string().describe("Monday ISO date YYYY-MM-DD"),
        }),
        execute: async ({ weekStart }) => {
          const { data: assignments } = await supabase
            .from("rota_assignments")
            .select("date, shift_type, is_manual_override, staff(first_name, last_name, role)")
            .gte("date", weekStart)
            .lte("date", (() => {
              const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().split("T")[0]
            })()) as { data: { date: string; shift_type: string; is_manual_override: boolean; staff: { first_name: string; last_name: string; role: string } | null }[] | null }

          const { data: rota } = await supabase
            .from("rotas")
            .select("status, published_at")
            .eq("week_start", weekStart)
            .maybeSingle() as { data: { status: string; published_at: string | null } | null }

          if (!assignments || assignments.length === 0) {
            return { weekStart, status: "no_rota", days: [] }
          }

          const byDate: Record<string, string[]> = {}
          for (const a of assignments) {
            if (!a.staff) continue
            if (!byDate[a.date]) byDate[a.date] = []
            byDate[a.date].push(`${a.staff.first_name} ${a.staff.last_name} (${a.staff.role})`)
          }

          return {
            weekStart,
            status: rota?.status ?? "draft",
            days: Object.entries(byDate).sort().map(([date, staff]) => ({ date, staff })),
          }
        },
      }),

      getStaffList: tool({
        description: "Get all active staff members, their roles, and skills.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await supabase
            .from("staff")
            .select("first_name, last_name, role, onboarding_status, staff_skills(skill)")
            .neq("onboarding_status", "inactive")
            .order("last_name") as {
              data: { first_name: string; last_name: string; role: StaffRole; onboarding_status: string; staff_skills: { skill: SkillName }[] }[] | null
            }

          return (data ?? []).map((s) => ({
            name: `${s.first_name} ${s.last_name}`,
            role: s.role,
            status: s.onboarding_status,
            skills: s.staff_skills.map((sk) => SKILL_LABEL[sk.skill] ?? sk.skill),
          }))
        },
      }),

      getUpcomingLeaves: tool({
        description: "Get approved leaves for the next 30 days.",
        inputSchema: z.object({}),
        execute: async () => {
          const today = new Date().toISOString().split("T")[0]
          const future = new Date(); future.setDate(future.getDate() + 30)
          const futureStr = future.toISOString().split("T")[0]

          const { data } = await supabase
            .from("leaves")
            .select("type, start_date, end_date, staff(first_name, last_name)")
            .eq("status", "approved")
            .lte("start_date", futureStr)
            .gte("end_date", today)
            .order("start_date") as {
              data: { type: string; start_date: string; end_date: string; staff: { first_name: string; last_name: string } | null }[] | null
            }

          return (data ?? []).map((l) => ({
            staff: l.staff ? `${l.staff.first_name} ${l.staff.last_name}` : "Unknown",
            type: l.type,
            from: l.start_date,
            to: l.end_date,
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
          leaveType: z.enum(["annual", "sick", "personal", "other"]),
          startDate: z.string().describe("ISO date YYYY-MM-DD"),
          endDate: z.string().describe("ISO date YYYY-MM-DD"),
          notes: z.string().optional(),
        }),
        execute: async (params) => {
          // Resolve staff ID
          const nameParts = params.staffName.trim().split(" ")
          const { data: staff } = await supabase
            .from("staff")
            .select("id, first_name, last_name")
            .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
            .maybeSingle() as { data: { id: string; first_name: string; last_name: string } | null }

          return {
            proposal: true,
            action: "addLeave" as const,
            params: {
              staffId: staff?.id ?? null,
              staffName: staff ? `${staff.first_name} ${staff.last_name}` : params.staffName,
              leaveType: params.leaveType,
              startDate: params.startDate,
              endDate: params.endDate,
              notes: params.notes ?? null,
            },
            description: `Add ${params.leaveType} leave for ${params.staffName}: ${params.startDate} – ${params.endDate}`,
          }
        },
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
