/**
 * One-time script: create a user and assign to an org.
 * Usage: USER_EMAIL=x USER_PASSWORD=y ORG_SEARCH=abu npx tsx scripts/create-demo-user.ts
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
} catch {}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY!
  const email = process.env.USER_EMAIL!
  const password = process.env.USER_PASSWORD!
  const orgSearch = (process.env.ORG_SEARCH ?? "").toLowerCase()

  if (!url || !key || !email || !password) {
    console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, USER_EMAIL, USER_PASSWORD")
    process.exit(1)
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. List orgs
  const { data: orgs, error: orgErr } = await admin.from("organisations").select("id, name, slug")
  if (orgErr) { console.error("Failed to list orgs:", orgErr.message); process.exit(1) }
  console.log("Available orgs:", orgs?.map(o => `${o.name} (${o.slug})`).join(", "))

  const org = orgs?.find(o =>
    o.name.toLowerCase().includes(orgSearch) || o.slug.toLowerCase().includes(orgSearch)
  )
  if (!org) { console.error(`No org matching "${orgSearch}"`); process.exit(1) }
  console.log(`Selected org: ${org.name} (${org.id})`)

  // 2. Create or find user
  const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 })
  let user = listData?.users.find(u => u.email === email)

  if (user) {
    console.log(`User ${email} already exists (${user.id}), updating password...`)
    const { error } = await admin.auth.admin.updateUserById(user.id, { password })
    if (error) { console.error("Failed to update password:", error.message); process.exit(1) }
  } else {
    console.log(`Creating user ${email}...`)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Demo User 2" },
    })
    if (error) { console.error("Failed to create user:", error.message); process.exit(1) }
    user = data.user
    console.log(`Created user: ${user.id}`)
  }

  // 3. Ensure profile exists
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: user.id,
    email,
    full_name: "Demo User 2",
    active_organisation_id: org.id,
  }, { onConflict: "id" })
  if (profileErr) console.warn("Profile upsert warning:", profileErr.message)

  // 4. Add to org
  const { error: memberErr } = await admin.from("organisation_members").upsert({
    organisation_id: org.id,
    user_id: user.id,
    role: "admin",
  }, { onConflict: "organisation_id,user_id" })
  if (memberErr) { console.error("Failed to add to org:", memberErr.message); process.exit(1) }

  console.log(`\n✅ ${email} is now a member of ${org.name} with password set.`)
}

main().catch(err => { console.error(err); process.exit(1) })
