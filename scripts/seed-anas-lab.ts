/**
 * Seed script: create Ana's Lab with realistic dummy data.
 * Usage: npx tsx scripts/seed-anas-lab.ts
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

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function monday(weeksFromNow: number): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff + weeksFromNow * 7)
  return d.toISOString().split("T")[0]
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding Ana's Lab…\n")

  // ── 1. Organisation ────────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await db
    .from("organisations")
    .insert({ name: "Ana's Lab", slug: "anas-lab", is_active: true })
    .select()
    .single() as { data: { id: string } | null; error: unknown }

  if (orgErr) {
    const e = orgErr as { code?: string; message?: string }
    if (e.code === "23505") {
      console.error("⛔  Organisation 'anas-lab' already exists. Delete it first.")
    } else {
      console.error("⛔  Failed to create org:", e.message)
    }
    process.exit(1)
  }

  const orgId = org!.id
  console.log(`✅  Organisation created: ${orgId}`)

  // ── 2. Lab config ──────────────────────────────────────────────────────────
  await db.from("lab_config").insert({
    organisation_id: orgId,
    min_lab_coverage: 3,
    min_andrology_coverage: 1,
    min_weekend_andrology: 1,
    punctions_average: 6,
    staffing_ratio: 1.0,
    admin_on_weekends: false,
  })
  console.log("✅  Lab config seeded")

  // ── 3. Clinic user (Ana) ───────────────────────────────────────────────────
  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email: "ana@anaslab.demo",
    email_confirm: true,
    user_metadata: { full_name: "Ana García" },
  })
  if (authErr) { console.error("⛔  Failed to create user:", authErr.message); process.exit(1) }

  await db.from("profiles").update({ organisation_id: orgId, full_name: "Ana García" }).eq("id", authUser.user.id)
  console.log(`✅  Clinic user created: ana@anaslab.demo (${authUser.user.id})`)

  // ── 4. Staff ───────────────────────────────────────────────────────────────
  const staffData = [
    // Lab embryologists
    { first_name: "Laura",    last_name: "Martínez",  role: "lab",       working_pattern: ["mon","tue","wed","thu","fri"],          contracted_hours: 37, start_date: "2023-01-09" },
    { first_name: "Carmen",   last_name: "Ruiz",      role: "lab",       working_pattern: ["mon","tue","wed","thu","fri"],          contracted_hours: 37, start_date: "2022-06-01" },
    { first_name: "Patricia", last_name: "López",     role: "lab",       working_pattern: ["mon","tue","wed","thu","fri"],          contracted_hours: 37, start_date: "2024-03-01" },
    { first_name: "Sofía",    last_name: "Fernández", role: "lab",       working_pattern: ["mon","tue","wed","thu","fri","sat"],    contracted_hours: 37, start_date: "2021-09-01" },
    { first_name: "Elena",    last_name: "Sánchez",   role: "lab",       working_pattern: ["tue","wed","thu","fri","sat"],         contracted_hours: 30, start_date: "2023-09-01" },
    // Andrology
    { first_name: "Miguel",   last_name: "Torres",    role: "andrology", working_pattern: ["mon","tue","wed","thu","fri"],          contracted_hours: 37, start_date: "2022-01-10" },
    { first_name: "Javier",   last_name: "Moreno",    role: "andrology", working_pattern: ["mon","tue","wed","thu","fri","sat","sun"], contracted_hours: 37, start_date: "2020-05-01" },
    { first_name: "Rodrigo",  last_name: "Jiménez",   role: "andrology", working_pattern: ["wed","thu","fri","sat","sun"],         contracted_hours: 30, start_date: "2024-06-01" },
    // Admin
    { first_name: "Isabel",   last_name: "Navarro",   role: "admin",     working_pattern: ["mon","tue","wed","thu","fri"],          contracted_hours: 37, start_date: "2021-01-04" },
  ]

  const { data: staff, error: staffErr } = await db
    .from("staff")
    .insert(staffData.map(s => ({ ...s, organisation_id: orgId, onboarding_status: "active" })))
    .select() as { data: { id: string; first_name: string; last_name: string; role: string }[] | null; error: unknown }

  if (staffErr || !staff) { console.error("⛔  Failed to insert staff:", (staffErr as { message?: string })?.message); process.exit(1) }
  console.log(`✅  ${staff.length} staff members created`)

  // ── 5. Skills ──────────────────────────────────────────────────────────────
  const byName = (first: string, last: string) => staff.find(s => s.first_name === first && s.last_name === last)!.id

  const skillsData = [
    // Laura — senior embryologist
    { staff_id: byName("Laura",    "Martínez"),  skills: ["icsi","iui","vitrification","thawing","biopsy","witnessing"] },
    // Carmen — experienced
    { staff_id: byName("Carmen",   "Ruiz"),      skills: ["icsi","iui","vitrification","thawing","witnessing"] },
    // Patricia — mid-level
    { staff_id: byName("Patricia", "López"),     skills: ["iui","vitrification","thawing","witnessing"] },
    // Sofía — trained in weekends
    { staff_id: byName("Sofía",    "Fernández"), skills: ["icsi","iui","vitrification","thawing","biopsy","witnessing"] },
    // Elena — junior
    { staff_id: byName("Elena",    "Sánchez"),   skills: ["thawing","witnessing"] },
    // Miguel — andrology specialist
    { staff_id: byName("Miguel",   "Torres"),    skills: ["semen_analysis","sperm_prep","iui"] },
    // Javier — senior andrology, covers weekends
    { staff_id: byName("Javier",   "Moreno"),    skills: ["semen_analysis","sperm_prep","iui","witnessing"] },
    // Rodrigo — junior andrology
    { staff_id: byName("Rodrigo",  "Jiménez"),   skills: ["semen_analysis","sperm_prep"] },
  ]

  const skillRows = skillsData.flatMap(({ staff_id, skills }) =>
    skills.map(skill => ({ organisation_id: orgId, staff_id, skill }))
  )
  const { error: skillErr } = await db.from("staff_skills").insert(skillRows)
  if (skillErr) { console.error("⛔  Failed to insert skills:", (skillErr as { message?: string })?.message); process.exit(1) }
  console.log(`✅  ${skillRows.length} skills assigned`)

  // ── 6. Leaves ──────────────────────────────────────────────────────────────
  const thisMonday = monday(0)
  const leavesData = [
    // Carmen — annual leave next week Mon–Fri
    {
      staff_id: byName("Carmen", "Ruiz"),
      type: "annual",
      start_date: monday(1),
      end_date: addDays(monday(1), 4),
      status: "approved",
      notes: "Summer holiday",
    },
    // Miguel — sick leave this week Wed–Thu
    {
      staff_id: byName("Miguel", "Torres"),
      type: "sick",
      start_date: addDays(thisMonday, 2),
      end_date: addDays(thisMonday, 3),
      status: "approved",
      notes: null,
    },
    // Patricia — personal day in two weeks
    {
      staff_id: byName("Patricia", "López"),
      type: "personal",
      start_date: addDays(monday(2), 1),
      end_date: addDays(monday(2), 1),
      status: "approved",
      notes: null,
    },
  ]

  const { error: leaveErr } = await db.from("leaves").insert(
    leavesData.map(l => ({ ...l, organisation_id: orgId }))
  )
  if (leaveErr) { console.error("⛔  Failed to insert leaves:", (leaveErr as { message?: string })?.message); process.exit(1) }
  console.log(`✅  ${leavesData.length} leaves created`)

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Ana's Lab seeded successfully!

  Org ID   : ${orgId}
  Login as : ana@anaslab.demo  (magic link)

  Staff    : 9 members (5 lab · 3 andrology · 1 admin)
  Leaves   : 3 upcoming leaves
  Config   : min 3 lab · 1 andrology coverage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

main().catch(err => { console.error(err); process.exit(1) })
