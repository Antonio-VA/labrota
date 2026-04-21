import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, streamText, stepCountIs } from "ai"
import { CLAUDE_MODEL } from "@/lib/constants"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { addDays } from "@/lib/engine-helpers"
import { buildReadTools } from "./_lib/read-tools"
import { buildProposeTools } from "./_lib/propose-tools"
import { buildSystemPrompt } from "./_lib/system-prompt"
import { validateChatBody } from "./_lib/validate-body"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Defense in depth: RLS filters by auth_organisation_id(), but we also
  // scope every query below with .eq("organisation_id", orgId). If the user
  // isn't a member of any org, fail fast rather than rely on empty RLS results.
  const orgId = await getOrgId()
  if (!orgId) return Response.json({ error: "No organisation." }, { status: 403 })

  const { success } = rateLimit(`chat:${user.id}`, 20)
  if (!success) return rateLimitResponse()

  // Bounds before we hand anything to the AI model. A malformed or oversized
  // payload would either crash `convertToModelMessages` or (worse) balloon
  // provider cost + latency before the rate limiter notices.
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }
  const validated = validateChatBody(body)
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 })
  }
  const { messages: typedMessages, viewingWeekStart: safeViewingWeekStart, currentPage: safeCurrentPage } = validated

  const viewingWeekEnd = safeViewingWeekStart ? addDays(safeViewingWeekStart, 6) : undefined

  const systemText = buildSystemPrompt({
    viewingWeekStart: safeViewingWeekStart,
    viewingWeekEnd,
    currentPage: safeCurrentPage,
  })

  try {
    const result = streamText({
      model: anthropic(CLAUDE_MODEL),
      system: systemText,
      abortSignal: AbortSignal.timeout(30_000),
      messages: await convertToModelMessages(typedMessages),
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      stopWhen: stepCountIs(5),
      tools: {
        ...buildReadTools({ supabase, orgId, viewingWeekStart: safeViewingWeekStart, viewingWeekEnd }),
        ...buildProposeTools({ supabase, orgId }),
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
