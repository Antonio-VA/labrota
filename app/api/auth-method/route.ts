import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get("email")?.trim().toLowerCase()

  if (!email) {
    return Response.json({ method: "password" })
  }

  try {
    const admin = createAdminClient()

    // Look up user profile by email → get their active org
    const { data: profile } = await admin
      .from("profiles")
      .select("organisation_id")
      .eq("email", email)
      .maybeSingle() as { data: { organisation_id: string | null } | null }

    if (!profile?.organisation_id) {
      // Don't reveal whether email exists — return default
      return Response.json({ method: "password" })
    }

    // Get org auth_method
    const { data: org } = await admin
      .from("organisations")
      .select("auth_method")
      .eq("id", profile.organisation_id)
      .single() as { data: { auth_method: string } | null }

    return Response.json({ method: org?.auth_method ?? "password" })
  } catch {
    return Response.json({ method: "password" })
  }
}
