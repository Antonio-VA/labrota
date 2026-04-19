import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

/**
 * Auth method hint for the login page.
 *
 * This endpoint used to look up the caller's email in `profiles` and
 * return the org's configured `auth_method`, which let an attacker
 * enumerate which emails were registered (an OTP response revealed
 * membership, whereas an unknown email fell through to "password").
 *
 * The lookup is intentionally removed: the login page now always
 * starts on the password step, and OTP-only users switch via the
 * "Send code instead" link. Supabase's `signInWithOtp` and
 * `signInWithPassword` never leak whether the email is registered, so
 * the whole flow becomes constant-time with respect to account
 * existence.
 */
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rl = rateLimit(`auth-method:${ip}`, 10)
  if (!rl.success) return rateLimitResponse()

  return Response.json({ method: "password" })
}
