import { anthropic } from "@ai-sdk/anthropic"
import { generateObject } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import type { ProcessedFile } from "@/lib/types/import"

const extractionSchema = z.object({
  staff: z.array(z.object({
    name: z.string(),
    department: z.string().describe("One of: lab, andrology, admin — infer from context"),
    shift_preference: z.string().describe("Most common shift code for this person, or empty"),
    observed_days: z.array(z.string()).describe("Day codes where this person typically works: mon, tue, wed, thu, fri, sat, sun"),
  })),
  shifts: z.array(z.object({
    code: z.string().describe("Short code like T1, AM, PM, M, T, N"),
    name: z.string().describe("Descriptive name"),
    start: z.string().describe("Start time in HH:MM format"),
    end: z.string().describe("End time in HH:MM format"),
  })),
  techniques: z.array(z.object({
    name: z.string(),
    code: z.string().describe("2-3 character uppercase code"),
    department: z.string().describe("lab or andrology"),
  })),
  rules: z.array(z.object({
    type: z.string().describe("One of: no_coincidir, supervisor_requerido, max_dias_consecutivos, distribucion_fines_semana, descanso_fin_de_semana, no_misma_tarea, no_librar_mismo_dia"),
    description: z.string().describe("Human-readable description of the rule in Spanish"),
    staff_involved: z.array(z.string()).describe("Names of staff involved. For supervisor_requerido, the FIRST name is the supervisor."),
    confidence: z.number().describe("How consistently this pattern appears, from 0.0 (never) to 1.0 (always)"),
    observed_count: z.number().describe("Number of weeks where pattern was observed"),
    total_weeks: z.number().describe("Total weeks analysed"),
  })),
  rota_mode: z.object({
    type: z.enum(["by_task", "by_shift"]).describe("Whether the rota is organised by task/procedure or by shift. by_task = staff assigned to specific tasks each day (typical for large labs). by_shift = staff assigned to shifts with no task granularity (typical for smaller labs)."),
    confidence: z.number().describe("How confident the detection is, from 0.0 to 1.0"),
    reasoning: z.string().describe("Brief explanation of why this mode was detected"),
  }),
  task_coverage: z.array(z.object({
    task_code: z.string().describe("Technique/task code"),
    typical_staff_count: z.number().describe("Most commonly observed number of staff assigned to this task per day"),
    min_observed: z.number().describe("Minimum staff count observed across all weeks"),
    max_observed: z.number().describe("Maximum staff count observed"),
  })).describe("Per-task staffing levels observed — only populated if rota_mode is by_task"),
  lab_settings: z.object({
    coverage_by_day: z.object({
      weekday: z.object({ lab: z.number(), andrology: z.number(), admin: z.number() }),
      saturday: z.object({ lab: z.number(), andrology: z.number(), admin: z.number() }),
      sunday: z.object({ lab: z.number(), andrology: z.number(), admin: z.number() }),
    }).describe("Minimum staff per department. Count the lowest observed headcount per department on weekdays, Saturdays, and Sundays separately."),
    punctions_by_day: z.object({
      weekday: z.number(),
      saturday: z.number(),
      sunday: z.number(),
    }).describe("Daily OPU/egg collection procedure count. If the rota mentions OPU/punción counts, extract them. Otherwise use 0."),
    days_off_preference: z.enum(["always_weekend", "prefer_weekend", "any_day"])
      .describe("Infer from the rota: if days off are always sat+sun → always_weekend. If mostly weekends but some weekday offs → prefer_weekend. If days off spread across all days → any_day."),
    shift_rotation: z.enum(["stable", "weekly", "daily"])
      .describe("stable = staff keep same shift across weeks. weekly = shift changes each week. daily = shift can change daily. Infer from patterns observed."),
    admin_on_weekends: z.boolean()
      .describe("Whether admin staff appear on weekends in the rota."),
  }),
})

const SYSTEM_PROMPT = `You are analysing staff rota/schedule files for an IVF (In Vitro Fertilisation) embryology laboratory.

Your task is to extract structured data from these historical schedule files. Extract:

1. **Staff**: All staff names and their apparent roles/departments. Departments should be classified as:
   - "lab" = embryologists, laboratory staff, scientists
   - "andrology" = andrologists, semen processing staff
   - "admin" = administrative staff, coordinators, managers
   Infer the department from context (which tasks they do, which section they appear in).

2. **Shifts**: Shift types with start and end times. Common patterns:
   - Morning/AM shifts (typically 07:00-15:00)
   - Afternoon/PM shifts (typically 15:00-23:00)
   - Full day shifts
   - Night shifts
   Use short codes (T1, T2, T3 or AM, PM, etc.)

3. **Techniques/Procedures**: Laboratory procedures assigned to staff. Common IVF lab techniques:
   - ICSI, OPU (egg retrieval), ET (embryo transfer), Biopsia, Vitrificación, Descongelación
   - Seminograma, Capacitación, TUB (tube preparation)
   Use 2-3 character uppercase codes.

4. **Rules/Patterns**: Observable scheduling rules. Look for these specific types:
   - no_coincidir: Two staff who never work the same day
   - supervisor_requerido: A designated supervisor must always be on the same day and shift as the supervised staff. Put the SUPERVISOR name FIRST in staff_involved.
   - max_dias_consecutivos: Maximum consecutive days worked
   - distribucion_fines_semana: Weekend distribution patterns (fair rotation of weekend work)
   - descanso_fin_de_semana: If someone works one weekend, they rest the next
   - no_misma_tarea: Two staff should not be assigned to the same task/procedure on the same day
   - no_librar_mismo_dia: Two staff should not both have the day off on the same day

   For each rule, calculate confidence based on consistency across all weeks provided.

5. **Rota mode detection**: Determine whether this lab organises its rota:
   - "by_task" = staff are assigned to specific tasks/procedures each day. This is typical for LARGE laboratories (10+ staff) where specialisation matters.
   - "by_shift" = staff are assigned to shifts (morning/afternoon/full) without task-level detail. This is typical for SMALLER laboratories (<10 staff) where everyone does everything.
   Look for: if the schedule has columns/sections for specific procedures (ICSI, OPU, etc), it's by_task. If it only shows shift assignments (AM/PM/T1/T2), it's by_shift.

6. **Task coverage** (only if by_task): For each technique/task, count how many staff are typically assigned per day. This helps set minimum coverage requirements. Report the typical (mode), minimum, and maximum staff count observed.

7. **Lab settings**: Infer configuration defaults from the rota:
   - **Coverage by day**: Count the MINIMUM staff per department (lab, andrology, admin) observed on weekdays, Saturdays, and Sundays. This becomes the minimum headcount.
   - **Punciones (OPU)**: If the rota mentions procedure counts for egg collection/OPU/punción, extract the average per-day count. If not mentioned, return 0.
   - **Days off preference**: Look at when staff have their days off. "always_weekend" = everyone off sat+sun. "prefer_weekend" = most off on weekends. "any_day" = days off spread evenly across the week.
   - **Shift rotation**: "stable" = same person stays on the same shift type week after week. "weekly" = shifts rotate each week. "daily" = different shift every day.
   - **Admin on weekends**: Whether any admin-department staff appear on weekend days.

Return ONLY the structured JSON. Be thorough — extract every staff member, every shift type, every technique, and every observable pattern.
If a field cannot be determined, use reasonable defaults (empty string for unknown shifts, "lab" for ambiguous departments).`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { success } = rateLimit(`import:${user.id}`, 10) // 10 req/min per user
  if (!success) return rateLimitResponse()

  const { files }: { files: ProcessedFile[] } = await req.json()
  if (!files?.length) {
    return Response.json({ error: "No files provided" }, { status: 400 })
  }
  if (files.length > 10) {
    return Response.json({ error: "Maximum 10 files per request" }, { status: 400 })
  }

  const ALLOWED_TYPES = ["text", "image"] as const
  const ALLOWED_MEDIA = ["image/png", "image/jpeg", "image/webp", "application/pdf"]
  const MAX_CONTENT_LENGTH = 10 * 1024 * 1024 // 10 MB total

  let totalBytes = 0
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return Response.json({ error: `Invalid file type: ${file.type}` }, { status: 400 })
    }
    if (file.type === "image" && file.mediaType && !ALLOWED_MEDIA.includes(file.mediaType)) {
      return Response.json({ error: `Unsupported media type: ${file.mediaType}` }, { status: 400 })
    }
    totalBytes += (file.content?.length ?? 0) + (file.base64?.length ?? 0)
  }
  if (totalBytes > MAX_CONTENT_LENGTH) {
    return Response.json({ error: "Files too large. Maximum 10 MB total." }, { status: 413 })
  }

  // Build message content parts
  const parts: Array<{ type: "text"; text: string } | { type: "image"; image: string; mimeType: string }> = []

  for (const file of files) {
    if (file.type === "text" && file.content) {
      parts.push({
        type: "text" as const,
        text: `--- File: ${file.fileName} ---\n${file.content}\n--- End of file ---`,
      })
    } else if (file.type === "image" && file.base64) {
      parts.push({
        type: "text" as const,
        text: `--- Image file: ${file.fileName} ---`,
      })
      parts.push({
        type: "image" as const,
        image: file.base64,
        mimeType: file.mediaType ?? "image/png",
      })
    }
  }

  try {
    const result = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: extractionSchema,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: parts }],
    })

    return Response.json(result.object)
  } catch (err) {
    console.error("Import extraction error:", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    )
  }
}
