import type { UIMessage } from "ai"

// Intentionally conservative. The real provider accepts much larger payloads,
// but any single user message in our UI is a short question or a pasted
// snippet; anything larger signals misuse and should fail fast.
export const CHAT_LIMITS = {
  MAX_MESSAGES: 50,
  MAX_MESSAGE_CHARS: 50_000,
  MAX_TOTAL_CHARS: 400_000,
} as const

export type ValidatedChatBody = {
  ok: true
  messages: UIMessage[]
  viewingWeekStart: string | undefined
  currentPage: string | undefined
}

export type ChatValidationError = {
  ok: false
  error: string
}

/**
 * Validates the shape + size of a parsed chat-route request body.
 * Exported so the checks can be tested without standing up the whole route
 * (which depends on Supabase, the Anthropic SDK, etc.).
 */
export function validateChatBody(body: unknown): ValidatedChatBody | ChatValidationError {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be an object." }
  }
  const { messages, viewingWeekStart, currentPage } = body as {
    messages?: unknown; viewingWeekStart?: unknown; currentPage?: unknown
  }
  if (!Array.isArray(messages)) {
    return { ok: false, error: "`messages` must be an array." }
  }
  if (messages.length === 0) {
    return { ok: false, error: "`messages` cannot be empty." }
  }
  if (messages.length > CHAT_LIMITS.MAX_MESSAGES) {
    return { ok: false, error: `Too many messages (max ${CHAT_LIMITS.MAX_MESSAGES}).` }
  }
  let totalChars = 0
  for (const m of messages) {
    const size = JSON.stringify(m ?? null).length
    if (size > CHAT_LIMITS.MAX_MESSAGE_CHARS) {
      return { ok: false, error: `Message too large (max ${CHAT_LIMITS.MAX_MESSAGE_CHARS} chars).` }
    }
    totalChars += size
    if (totalChars > CHAT_LIMITS.MAX_TOTAL_CHARS) {
      return { ok: false, error: `Conversation too large (max ${CHAT_LIMITS.MAX_TOTAL_CHARS} chars).` }
    }
  }
  return {
    ok: true,
    messages: messages as UIMessage[],
    viewingWeekStart: typeof viewingWeekStart === "string" ? viewingWeekStart : undefined,
    currentPage: typeof currentPage === "string" ? currentPage : undefined,
  }
}
