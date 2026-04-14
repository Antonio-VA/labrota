import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rl = rateLimit(`auth-method:${ip}`, 10)
  if (!rl.success) return rateLimitResponse()

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
