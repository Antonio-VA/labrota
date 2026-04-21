import { tool } from "ai"
import { z } from "zod"
import type { LabConfigUpdate } from "@/lib/types/database"
import { propose } from "@/lib/proposal-types"
import { getMondayOf } from "@/lib/format-date"
import { LEAVE_TYPE_LABEL, RULE_TYPE_LABEL, SKILL_LABEL, resolveStaffByName, type SupabaseClient } from "./shared"

export function buildProposeTools(params: {
  supabase: SupabaseClient
  orgId: string
}) {
  const { supabase, orgId } = params

  return {
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
        const staff = await resolveStaffByName(supabase, orgId, params.staffName)
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
        const staff = await resolveStaffByName(supabase, orgId, staffName)
        if (!staff) return { error: `Staff member "${staffName}" not found.` }

        const weekStart = getMondayOf(date)
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
        const weekStart = getMondayOf(date)
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
          .eq("organisation_id", orgId)
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
          .eq("organisation_id", orgId)
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
        const staff = await resolveStaffByName(supabase, orgId, staffName, { activeOnly: true })
        if (!staff) return { error: `Staff member "${staffName}" not found.` }

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
      description: "Propose adding a skill (tecnica code) to a staff member. Use getSkills or getTecnicas to find valid skill codes for this org. The user must confirm.",
      inputSchema: z.object({
        staffName: z.string().describe("Full or partial name of the staff member"),
        skill: z.string().describe("Skill/tecnica code for this org (e.g. FIV, ICSI, IUI — fetch valid codes with getTecnicas)"),
        level: z.enum(["certified", "training"]).describe("Skill level"),
      }),
      execute: async ({ staffName, skill, level }) => {
        const staff = await resolveStaffByName(supabase, orgId, staffName, { activeOnly: true })
        if (!staff) return { error: `Staff member "${staffName}" not found.` }

        // Validate that the skill code exists for this org
        const { data: tecnica } = await supabase
          .from("tecnicas")
          .select("codigo")
          .eq("organisation_id", orgId)
          .eq("codigo", skill.toUpperCase())
          .maybeSingle() as { data: { codigo: string } | null }
        if (!tecnica) return { error: `Skill code "${skill}" not found. Use getTecnicas to list valid codes for this org.` }

        return propose(
          "addSkill",
          { staffId: staff.id, staffName: `${staff.first_name} ${staff.last_name}`, skill: tecnica.codigo, level },
          `Add ${SKILL_LABEL[skill] ?? skill} (${level}) to ${staff.first_name} ${staff.last_name}`,
        )
      },
    }),

    proposeRemoveSkill: tool({
      description: "Propose removing a skill from a staff member. The user must confirm.",
      inputSchema: z.object({
        staffName: z.string().describe("Full or partial name of the staff member"),
        skill: z.string().describe("Skill/tecnica code for this org — fetch valid codes with getTecnicas"),
      }),
      execute: async ({ staffName, skill }) => {
        const staff = await resolveStaffByName(supabase, orgId, staffName, { activeOnly: true })
        if (!staff) return { error: `Staff member "${staffName}" not found.` }

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
        const staff = await resolveStaffByName(supabase, orgId, staffName, { activeOnly: true })
        if (!staff) return { error: `Staff member "${staffName}" not found.` }

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
        const staffIds: string[] = []
        if (staffNames?.length) {
          const resolved = await Promise.all(
            staffNames.map((n) => resolveStaffByName(supabase, orgId, n, { activeOnly: true })),
          )
          for (const s of resolved) if (s) staffIds.push(s.id)
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
  }
}
