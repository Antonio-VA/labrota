/**
 * Create a clinic organisation + user account.
 *
 * Usage (from project root):
 *   npx tsx scripts/create-clinic-user.ts --org "Ana's Lab" --email user@example.com --password secret123
 *   npx tsx scripts/create-clinic-user.ts --org "Ana's Lab" --email user@example.com --password secret123 --name "Ana García"
 *
 * Flags:
 *   --org       Organisation name (required)
 *   --email     User email (required)
 *   --password  User password (required)
 *   --name      User full name (optional)
 *
 * Behaviour:
 *   - Creates the org if it doesn't already exist (matched by slug)
 *   - Creates the auth user if they don't already exist
 *   - Upserts the profile row linked to the org
 *   - User signs in via magic link — no password needed
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local
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
} catch { /* no .env.local — rely on process.env */ }

// ── Parse args ───────────────────────────────────────────────────────────────
function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const orgName  = getArg("--org")
const email    = getArg("--email")
const password = getArg("--password")
const fullName = getArg("--name")

if (!orgName || !email || !password) {
  console.error("\n⛔  Usage: npx tsx scripts/create-clinic-user.ts --org \"Org Name\" --email user@example.com --password secret123\n")
  process.exit(1)
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("\n⛔  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY\n")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const slug = generateSlug(orgName!)

  // ── 1. Find or create organisation ──────────────────────────────────────
  console.log(`\nLooking for org "${orgName}" (slug: ${slug})…`)

  const { data: existingOrg } = await supabase
    .from("organisations")
    .select("id, name")
    .eq("slug", slug)
    .single()

  let orgId: string

  if (existingOrg) {
    orgId = existingOrg.id
    console.log(`✓  Org already exists — ${existingOrg.name} (${orgId})`)
  } else {
    const { data: newOrg, error: orgError } = await supabase
      .from("organisations")
      .insert({ name: orgName!, slug, is_active: true })
      .select("id")
      .single()

    if (orgError || !newOrg) {
      console.error("\n⛔  Failed to create org:", orgError?.message)
      process.exit(1)
    }

    orgId = newOrg.id
    console.log(`✓  Org created — ${orgName} (${orgId})`)
  }

  // ── 2. Find or create auth user ──────────────────────────────────────────
  console.log(`\nLooking for user "${email}"…`)

  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    console.error("\n⛔  Failed to list users:", listError.message)
    process.exit(1)
  }

  const existingUser = users.find(u => u.email === email)
  let userId: string

  if (existingUser) {
    userId = existingUser.id
    console.log(`✓  Auth user already exists (${userId})`)
  } else {
    const { data: newUser, error: userError } = await supabase.auth.admin.createUser({
      email: email!,
      password: password!,
      email_confirm: true,
    })

    if (userError || !newUser.user) {
      console.error("\n⛔  Failed to create auth user:", userError?.message)
      process.exit(1)
    }

    userId = newUser.user.id
    console.log(`✓  Auth user created (${userId})`)
  }

  // ── 3. Upsert profile ────────────────────────────────────────────────────
  console.log(`\nUpserting profile…`)

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id:              userId,
      email:           email!,
      organisation_id: orgId,
      full_name:       fullName ?? null,
    }, { onConflict: "id" })

  if (profileError) {
    console.error("\n⛔  Failed to upsert profile:", profileError.message)
    process.exit(1)
  }

  console.log(`✓  Profile linked to org`)
  console.log(`\n✅  Done.`)
  console.log(`   Org   : ${orgName} (${orgId})`)
  console.log(`   Email : ${email}`)
  console.log(`   User  : ${userId}`)
  console.log(`\n   User can now sign in via magic link.\n`)
}

main().catch(err => {
  console.error("\n⛔  Unexpected error:", err, "\n")
  process.exit(1)
})
