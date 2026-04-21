import "server-only"
import { FROM_EMAIL } from "@/lib/config"
import { getResendApiKey } from "@/lib/env"

const RESEND_ENDPOINT = "https://api.resend.com/emails"
const RESEND_MAX_RECIPIENTS_PER_CALL = 50

export interface SendEmailParams {
  /** Recipient email(s). A single string or array. Arrays over 50 are auto-batched. */
  to: string | string[]
  subject: string
  /** Either `html` or `text` is required. If both are given, both are sent. */
  html?: string
  text?: string
  /** Defaults to FROM_EMAIL from lib/config.ts */
  from?: string
  /** Reply-To header (Resend uses `reply_to`). */
  replyTo?: string
}

export interface SendEmailResult {
  ok: boolean
  /** Error message if ok=false. Populated for API errors AND missing API key. */
  error?: string
  /** True when the send was skipped because RESEND_API_KEY is not configured. */
  skipped?: boolean
}

/**
 * Unified Resend API wrapper. Use this instead of raw `fetch()` calls —
 * centralises the endpoint, auth, `from` address, batching, and error shape.
 *
 * Behaviour:
 *   - Missing RESEND_API_KEY → returns `{ ok: false, skipped: true }` (no throw).
 *     Useful in dev where you want server actions to succeed without emails.
 *   - Empty `to` → no-op, returns `{ ok: true }`.
 *   - Recipients > 50 → auto-batched into multiple API calls.
 *   - Non-2xx response → returns `{ ok: false, error }` with Resend's message.
 *   - Network errors → returns `{ ok: false, error }`, does NOT throw.
 *
 * Callers decide whether to surface the error to the user (critical notifications)
 * or swallow it (best-effort updates). Never throws.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const resendKey = getResendApiKey()
  if (!resendKey) return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" }

  if (!params.html && !params.text) {
    return { ok: false, error: "sendEmail requires `html` or `text`" }
  }

  const recipients = Array.isArray(params.to) ? params.to : [params.to]
  if (recipients.length === 0) return { ok: true }

  const from = params.from ?? FROM_EMAIL

  // Batch recipients if over Resend's per-call limit.
  const batches: string[][] = []
  for (let i = 0; i < recipients.length; i += RESEND_MAX_RECIPIENTS_PER_CALL) {
    batches.push(recipients.slice(i, i + RESEND_MAX_RECIPIENTS_PER_CALL))
  }

  for (const batch of batches) {
    const body: Record<string, unknown> = {
      from,
      to: batch,
      subject: params.subject,
    }
    if (params.html) body.html = params.html
    if (params.text) body.text = params.text
    if (params.replyTo) body.reply_to = params.replyTo

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => "")
        return { ok: false, error: `Resend ${res.status}: ${errBody || res.statusText}` }
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return { ok: true }
}
