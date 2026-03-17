/**
 * One-time fix: promote an existing user to super_admin.
 * Usage: npx tsx scripts/set-super-admin.ts
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"

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
} catch { /* ignore */ }

const EMAIL = "antonio.grit@gmail.com"

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) { console.error("Failed to list users:", listErr.message); process.exit(1) }

  const user = list?.users.find(u => u.email === EMAIL)
  if (!user) { console.error(`User ${EMAIL} not found`); process.exit(1) }

  console.log(`Found user: ${user.email} (${user.id})`)
  console.log(`Current app_metadata:`, user.app_metadata)

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "super_admin" },
  })
  if (error) { console.error("Failed:", error.message); process.exit(1) }

  console.log("✅  super_admin role set successfully.")
}

main().catch(err => { console.error(err); process.exit(1) })
