/**
 * Environment variable validation.
 * Called once at server startup via instrumentation.ts.
 * Throws with a clear message listing every missing variable.
 */

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "ANTHROPIC_API_KEY",
] as const

const optional = [
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_REDIRECT_URI",
  "OUTLOOK_TOKEN_ENCRYPTION_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
] as const

export function validateEnv() {
  const missing = required.filter(
    (key) => !process.env[key] || process.env[key] === ""
  )

  if (missing.length > 0) {
    throw new Error(
      `[LabRota] Missing required environment variables:\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        `\n\nCopy .env.example to .env.local and fill in the values.`
    )
  }

  const unset = optional.filter(
    (key) => !process.env[key] || process.env[key] === ""
  )
  if (unset.length > 0) {
    console.warn(
      `[LabRota] Optional environment variables not set (some features will be disabled):\n` +
        unset.map((k) => `  - ${k}`).join("\n")
    )
  }
}
