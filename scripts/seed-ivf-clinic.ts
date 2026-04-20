/**
 * Seed script: create "IVF Clinic" org by copying Art Fertility data
 * with randomized staff names and generated leaves.
 *
 * Run: npx tsx scripts/seed-ivf-clinic.ts
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { toISODate } from "@/lib/format-date"
config({ path: ".env.local" })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Random name pools ────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Elena", "Carlos", "Sofía", "Mateo", "Lucía", "Diego", "Valentina", "Andrés",
  "Camila", "Javier", "Isabella", "Marcos", "Daniela", "Hugo", "Martina",
  "Pablo", "Natalia", "Álvaro", "Clara", "Adrián", "Laura", "Tomás", "Paula",
  "Miguel", "Ana", "Sergio", "Marta", "Raúl", "Inés", "Fernando",
]

const LAST_NAMES = [
  "García", "Martínez", "López", "Hernández", "González", "Rodríguez",
  "Pérez", "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Morales",
  "Vargas", "Castro", "Ortiz", "Reyes", "Jiménez", "Ruiz", "Díaz",
  "Navarro", "Romero", "Molina", "Álvarez", "Delgado", "Medina",
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomDate(from: string, to: string): string {
  const start = new Date(from + "T12:00:00").getTime()
  const end = new Date(to + "T12:00:00").getTime()
  const d = new Date(start + Math.random() * (end - start))
  return toISODate(d)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Finding Art Fertility clinic...")

  // Find source org
  const { data: orgs } = await supabase.from("organisations").select("id, name")
  const sourceOrg = orgs?.find((o: { name: string }) =>
    o.name.toLowerCase().includes("art") || o.name.toLowerCase().includes("fertility")
  )
  if (!sourceOrg) {
    // Use first org as source
    if (!orgs || orgs.length === 0) { console.error("No organisations found"); process.exit(1) }
    console.log(`Using "${orgs[0].name}" as source org`)
    Object.assign(sourceOrg ?? {}, orgs[0])
  }
  const srcId = (sourceOrg as { id: string }).id
  const srcName = (sourceOrg as { name: string }).name
  console.log(`  Source: "${srcName}" (${srcId})`)

  // Create new org
  console.log("\n📦 Creating IVF Clinic...")
  const { data: newOrg, error: orgErr } = await supabase
    .from("organisations")
    .insert({ name: "IVF Clinic", slug: "ivf-clinic", is_active: true })
    .select()
    .single()
  if (orgErr) { console.error("Org create error:", orgErr.message); process.exit(1) }
  const newId = (newOrg as { id: string }).id
  console.log(`  Created org: ${newId}`)

  // Seed lab_config
  const { data: srcConfig } = await supabase.from("lab_config").select("*").eq("organisation_id", srcId).maybeSingle()
  if (srcConfig) {
    const { id: _id, organisation_id: _organisation_id, created_at: _created_at, updated_at: _updated_at, ...configData } = srcConfig as Record<string, unknown>
    await supabase.from("lab_config").insert({ ...configData, organisation_id: newId })
    console.log("  ✓ lab_config copied")
  }

  // Copy shift_types
  console.log("\n⏱  Copying shift types...")
  const { data: srcShifts } = await supabase.from("shift_types").select("*").eq("organisation_id", srcId).order("sort_order")
  if (srcShifts) {
    for (const s of srcShifts as Record<string, unknown>[]) {
      const { id: _id, organisation_id: _organisation_id, created_at: _created_at, ...data } = s
      await supabase.from("shift_types").insert({ ...data, organisation_id: newId })
    }
    console.log(`  ✓ ${srcShifts.length} shift types`)
  }

  // Copy técnicas
  console.log("\n🧬 Copying técnicas...")
  const { data: srcTecnicas } = await supabase.from("tecnicas").select("*").eq("organisation_id", srcId).order("orden")
  if (srcTecnicas) {
    for (const t of srcTecnicas as Record<string, unknown>[]) {
      const { id: _id, organisation_id: _organisation_id, created_at: _created_at, ...data } = t
      await supabase.from("tecnicas").insert({ ...data, organisation_id: newId })
    }
    console.log(`  ✓ ${srcTecnicas.length} técnicas`)
  }

  // Copy departments
  console.log("\n🏷  Copying departments...")
  const { data: srcDepts } = await supabase.from("departments").select("*").eq("organisation_id", srcId).order("sort_order")
  if (srcDepts) {
    for (const d of srcDepts as Record<string, unknown>[]) {
      const { id: _id, organisation_id: _organisation_id, created_at: _created_at, ...data } = d
      await supabase.from("departments").insert({ ...data, organisation_id: newId })
    }
    console.log(`  ✓ ${srcDepts.length} departments`)
  }

  // Copy staff with randomized names
  console.log("\n👥 Copying staff with random names...")
  const { data: srcStaff } = await supabase.from("staff").select("*, staff_skills(*)").eq("organisation_id", srcId)
  if (!srcStaff || srcStaff.length === 0) { console.log("  No staff found"); process.exit(0) }

  const usedNames = new Set<string>()
  const staffIdMap: Record<string, string> = {} // old_id → new_id

  for (const s of srcStaff as Record<string, unknown>[]) {
    // Generate unique random name
    let firstName: string, lastName: string, fullName: string
    do {
      firstName = pickRandom(FIRST_NAMES)
      lastName = pickRandom(LAST_NAMES)
      fullName = `${firstName} ${lastName}`
    } while (usedNames.has(fullName))
    usedNames.add(fullName)

    const { id, organisation_id: _organisation_id, created_at: _created_at, updated_at: _updated_at, staff_skills, ...data } = s
    const { data: newStaff, error: staffErr } = await supabase
      .from("staff")
      .insert({
        ...data,
        organisation_id: newId,
        first_name: firstName,
        last_name: lastName,
        email: `${firstName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}@ivfclinic.example`,
      })
      .select()
      .single()

    if (staffErr) { console.error(`  Staff error: ${staffErr.message}`); continue }
    const newStaffId = (newStaff as { id: string }).id
    staffIdMap[id as string] = newStaffId

    // Copy skills
    const skills = (staff_skills ?? []) as Record<string, unknown>[]
    for (const sk of skills) {
      await supabase.from("staff_skills").insert({
        organisation_id: newId,
        staff_id: newStaffId,
        skill: sk.skill,
        level: sk.level,
      })
    }

    console.log(`  ✓ ${firstName} ${lastName} (${(s as { role: string }).role}) — ${skills.length} skills`)
  }

  // Generate random leaves
  console.log("\n🏖  Generating random leaves...")
  const leaveTypes = ["annual", "sick", "personal", "training", "maternity", "other"]
  const newStaffIds = Object.values(staffIdMap)
  let leaveCount = 0

  for (const staffId of newStaffIds) {
    // Each staff member gets 1-3 random leaves
    const numLeaves = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < numLeaves; i++) {
      const start = randomDate("2026-03-01", "2026-06-30")
      const durationDays = 1 + Math.floor(Math.random() * 7) // 1-7 days
      const endDate = new Date(start + "T12:00:00")
      endDate.setDate(endDate.getDate() + durationDays - 1)
      const end = toISODate(endDate)

      const type = pickRandom(leaveTypes)
      const status = Math.random() > 0.3 ? "approved" : "pending"

      await supabase.from("leaves").insert({
        organisation_id: newId,
        staff_id: staffId,
        type,
        start_date: start,
        end_date: end,
        status,
        notes: null,
      })
      leaveCount++
    }
  }
  console.log(`  ✓ ${leaveCount} leaves created`)

  // Add current user as admin member of the new org
  console.log("\n🔑 Adding your user as org admin...")
  const { data: profiles } = await supabase.from("profiles").select("id").limit(1)
  if (profiles && profiles.length > 0) {
    const userId = (profiles[0] as { id: string }).id
    await supabase.from("organisation_members").insert({
      organisation_id: newId,
      user_id: userId,
      role: "admin",
    })
    console.log(`  ✓ User ${userId} added as admin`)
  }

  console.log("\n✅ Done! IVF Clinic created with randomized staff and leaves.")
  console.log(`   Org ID: ${newId}`)
}

main().catch(console.error)
