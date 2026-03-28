import { anthropic } from "@ai-sdk/anthropic"
import { generateObject } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
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
    type: z.string().describe("One of: no_coincidir, supervisor_requerido, max_dias_consecutivos, distribucion_fines_semana, shift_preference, rotation_pattern, always_together"),
    description: z.string().describe("Human-readable description of the rule in Spanish"),
    staff_involved: z.array(z.string()).describe("Names of staff involved"),
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

4. **Rules/Patterns**: Observable scheduling rules. Look for:
   - Staff who never work the same day (no_coincidir)
   - Required supervisor presence (supervisor_requerido)
   - Maximum consecutive days worked (max_dias_consecutivos)
   - Weekend distribution patterns (distribucion_fines_semana)
   - Consistent shift preferences (shift_preference)
   - Technique rotation patterns (rotation_pattern)
   - Staff who always work together (always_together)

   For each rule, calculate confidence based on consistency across all weeks provided.

5. **Rota mode detection**: Determine whether this lab organises its rota:
   - "by_task" = staff are assigned to specific tasks/procedures each day. This is typical for LARGE laboratories (10+ staff) where specialisation matters.
   - "by_shift" = staff are assigned to shifts (morning/afternoon/full) without task-level detail. This is typical for SMALLER laboratories (<10 staff) where everyone does everything.
   Look for: if the schedule has columns/sections for specific procedures (ICSI, OPU, etc), it's by_task. If it only shows shift assignments (AM/PM/T1/T2), it's by_shift.

6. **Task coverage** (only if by_task): For each technique/task, count how many staff are typically assigned per day. This helps set minimum coverage requirements. Report the typical (mode), minimum, and maximum staff count observed.

Return ONLY the structured JSON. Be thorough — extract every staff member, every shift type, every technique, and every observable pattern.
If a field cannot be determined, use reasonable defaults (empty string for unknown shifts, "lab" for ambiguous departments).`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { files }: { files: ProcessedFile[] } = await req.json()
  if (!files?.length) {
    return Response.json({ error: "No files provided" }, { status: 400 })
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
