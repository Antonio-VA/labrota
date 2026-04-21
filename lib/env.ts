import "server-only"

/**
 * Centralised accessors for server-side environment variables.
 *
 * Why not `process.env.FOO` inline?
 *   - Misconfigured deployments (missing secrets, wrong case, leading spaces)
 *     fail loudly the first time the code runs, not silently-later when a
 *     particular endpoint handles a request.
 *   - Typos and renames are caught by TypeScript across the whole codebase.
 *   - Tests can override values by setting `process.env` before import.
 *
 * Intentionally lazy: the validators only run when called, not at module
 * load. That keeps `next build` from crashing when Supabase secrets aren't
 * present in the build environment (they only need to be set at runtime).
 *
 * Scope: server-only. Client-side URLs live in `lib/config.ts` because they
 * need the `NEXT_PUBLIC_` prefix and are inlined at build time anyway.
 *
 * Not covered here (has its own dedicated module for unrelated reasons):
 *   - `NEXT_PUBLIC_APP_URL` / `VERCEL_URL` → `lib/config.ts` (client + server)
 *   - Microsoft OAuth triplet           → `lib/outlook/config.ts`
 *   - Outlook token encryption key      → `lib/outlook/encryption.ts`
 *   - Supabase anon/service keys        → `lib/supabase/{client,server,admin}.ts`
 *     (these all use `!` assertion because the whole app is already broken
 *     if they're missing, and centralising them here would force every
 *     module that touches Supabase to import this file)
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(
      `Environment variable ${name} is required but was not set. ` +
      `See .env.example for the expected set of variables.`,
    )
  }
  return value
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]
  if (!value || value.trim() === "") return undefined
  return value
}

// ── HMAC token secrets (leave-action, swap-action, outlook state) ────────────

export function getLeaveTokenSecret(): string {
  return requireEnv("LEAVE_TOKEN_SECRET")
}

export function getSwapTokenSecret(): string {
  return requireEnv("SWAP_TOKEN_SECRET")
}

export function getOutlookStateSecret(): string {
  return requireEnv("OUTLOOK_STATE_SECRET")
}

// ── Cron auth ────────────────────────────────────────────────────────────────

export function getCronSecret(): string {
  return requireEnv("CRON_SECRET")
}

// ── Transactional email (Resend) ─────────────────────────────────────────────

/**
 * Returns the Resend API key if configured, `undefined` otherwise. Callers
 * (see `lib/email.ts`) choose between "skip + warn" and "throw" — absence is
 * acceptable in local dev where we don't want server actions to fail just
 * because no SMTP is wired up.
 */
export function getResendApiKey(): string | undefined {
  return optionalEnv("RESEND_API_KEY")
}
