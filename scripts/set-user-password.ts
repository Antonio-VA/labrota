/**
 * One-time script: set a password for an existing Supabase user.
 *
 * Usage (from project root):
 *   USER_EMAIL=demo@labrota.app USER_PASSWORD=yourpassword npx tsx scripts/set-user-password.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 * Reads .env.local automatically if present.
 *
 * DO NOT commit this script with passwords hardcoded.
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"

// ── Load .env.local ──────────────────────────────────────────────────────────
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8")
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (key && !(key in process.env)) process.env[key] = value
  }
} catch {
  // .env.local not found — fall through and rely on process.env
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY
  const targetEmail    = process.env.USER_EMAIL
  const newPassword    = process.env.USER_PASSWORD

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("\n⛔  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.\n")
    process.exit(1)
  }
  if (!targetEmail || !newPassword) {
    console.error("\n⛔  Missing USER_EMAIL or USER_PASSWORD environment variables.\n")
    console.error("    Usage: USER_EMAIL=x@y.com USER_PASSWORD=secret npx tsx scripts/set-user-password.ts\n")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Find the user by email
  console.log(`Looking up user: ${targetEmail}…`)
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listError) {
    console.error("\n⛔  Failed to list users:", listError.message)
    process.exit(1)
  }

  const user = listData.users.find((u) => u.email === targetEmail)
  if (!user) {
    console.error(`\n⛔  No user found with email: ${targetEmail}\n`)
    process.exit(1)
  }

  // Set the password
  console.log(`Setting password for ${user.email} (${user.id})…`)
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword })
  if (error) {
    console.error("\n⛔  Failed to set password:", error.message, "\n")
    process.exit(1)
  }

  console.log(`\n✅  Password updated for ${user.email}\n`)
}

main().catch((err) => {
  console.error("\n⛔  Unexpected error:", err, "\n")
  process.exit(1)
})
