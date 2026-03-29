import { anthropic } from "@ai-sdk/anthropic"
import { generateObject } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import type { ProcessedFile } from "@/lib/types/import"

const futureRotaSchema = z.object({
  assignments: z.array(z.object({
    staff_name: z.string().describe("Full name as written in the file"),
    date: z.string().describe("ISO date (YYYY-MM-DD)"),
    shift_code: z.string().describe("Shift code as written (e.g. T1, M, Mañana, AM)"),
    task_codes: z.array(z.string()).optional()
      .describe("Task/técnica codes if present (e.g. ICSI, OPU). Empty array or omit if not specified."),
  })),
  date_range: z.object({
    start: z.string().describe("First date found (ISO)"),
    end: z.string().describe("Last date found (ISO)"),
  }),
  days_off: z.array(z.object({
    staff_name: z.string(),
    date: z.string().describe("ISO date"),
  })).describe("Staff explicitly marked as off/libre on specific dates"),
  unrecognised_shifts: z.array(z.string())
    .describe("Shift codes found that don't match common patterns — flag for review"),
})

const SYSTEM_PROMPT = `Parse this rota/schedule file into structured assignments.

For each person on each date, extract:
- Their name (as written)
- The date (convert to ISO YYYY-MM-DD)
- Their shift code (as written — e.g. "T1", "M", "Mañana", "AM")
- Any task/técnica codes if the rota specifies tasks per person

Mark days where a person is explicitly off (L, Libre, X, Descanso, —) as days_off entries.
Skip completely empty cells — they mean the person isn't scheduled that day.

If the file covers multiple weeks, include all dates.
Dates may be in any format (DD/MM, DD/MM/YYYY, "Lunes 6 Abril", etc.) — normalise to ISO.
Names may be abbreviated — preserve as-is, the system will fuzzy-match them.

Return ONLY the structured data. Be thorough — extract every assignment and every day off.`

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

  const parts: Array<{ type: "text"; text: string } | { type: "image"; image: string; mimeType: string }> = []

  for (const file of files) {
    if (file.type === "text" && file.content) {
      parts.push({ type: "text", text: `--- File: ${file.fileName} ---\n${file.content}\n--- End of file ---` })
    } else if (file.type === "image" && file.base64) {
      parts.push({ type: "text", text: `--- Image file: ${file.fileName} ---` })
      parts.push({ type: "image", image: file.base64, mimeType: file.mediaType ?? "image/png" })
    }
  }

  try {
    const result = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: futureRotaSchema,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: parts }],
    })

    return Response.json(result.object)
  } catch (err) {
    console.error("Import rota extraction error:", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    )
  }
}
