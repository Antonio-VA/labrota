/**
 * One-time script: create the LabRota super admin account.
 *
 * Usage (from project root):
 *   npx tsx scripts/create-super-admin.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 * Reads .env.local automatically if present.
 *
 * Refuses to run if a super admin already exists.
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
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
} catch {
  // .env.local not found — fall through and rely on process.env
}

// ── Config ───────────────────────────────────────────────────────────────────
const SUPER_ADMIN_EMAIL = "antonio.grit@gmail.com"

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "\n⛔  Missing environment variables.\n" +
        "    NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set\n" +
        "    (add them to .env.local or export them before running).\n"
    )
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Guard: refuse if any super admin already exists ──────────────────────
  console.log("Checking for existing super admin…")

  let page = 1
  let existingSuperAdmin: { id: string; email?: string } | null = null

  // listUsers is paginated — walk all pages
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) {
      console.error("\n⛔  Failed to list users:", error.message)
      process.exit(1)
    }

    const found = data.users.find((u) => u.app_metadata?.role === "super_admin")
    if (found) {
      existingSuperAdmin = found
      break
    }

    // Supabase returns fewer items than perPage when on the last page
    if (data.users.length < 1000) break
    page++
  }

  if (existingSuperAdmin) {
    console.error(
      `\n⛔  A super admin already exists (${existingSuperAdmin.email ?? existingSuperAdmin.id}).\n` +
        "    This script is a one-time setup and cannot be run again.\n"
    )
    process.exit(1)
  }

  // ── Create the super admin ───────────────────────────────────────────────
  console.log(`Creating super admin: ${SUPER_ADMIN_EMAIL}…`)

  const { data, error } = await supabase.auth.admin.createUser({
    email: SUPER_ADMIN_EMAIL,
    email_confirm: true,           // skip email verification — they'll use magic link
    app_metadata: {
      role: "super_admin",         // server-side only — cannot be spoofed by the user
    },
  })

  if (error) {
    console.error("\n⛔  Failed to create super admin:", error.message, "\n")
    process.exit(1)
  }

  console.log("\n✅  Super admin created successfully.")
  console.log(`    Email : ${data.user.email}`)
  console.log(`    ID    : ${data.user.id}`)
  console.log("")
  console.log(
    "    Sign in via magic link at admin.labrota.app once the super admin portal is deployed.\n"
  )
}

main().catch((err) => {
  console.error("\n⛔  Unexpected error:", err, "\n")
  process.exit(1)
})
