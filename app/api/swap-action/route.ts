import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createHmac, timingSafeEqual } from "crypto"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { TOKEN_TTL_MS } from "@/lib/config"
import { sendSwapTargetEmail, notifySwapTarget, notifySwapInitiator } from "@/lib/swap-email"
import { executeSwap } from "@/app/(clinic)/swaps/actions"
import { actionResultPage, actionErrorPage } from "@/lib/email-page"

function getSecret(): Buffer {
  const secret = process.env.SWAP_TOKEN_SECRET
  if (!secret) throw new Error("SWAP_TOKEN_SECRET env var is required")
  return Buffer.from(secret)
}


export function signSwapAction(swapId: string, action: "approve" | "reject", step: "manager" | "target"): string {
  const expires = Date.now() + TOKEN_TTL_MS
  return `${expires}.${createHmac("sha256", getSecret()).update(`${swapId}:${action}:${step}:${expires}`).digest("hex")}`
}

function verifySwapAction(swapId: string, action: string, step: string, token: string): boolean {
  const dotIdx = token.indexOf(".")
  if (dotIdx === -1) return false
  const expires = Number(token.slice(0, dotIdx))
  const sig = token.slice(dotIdx + 1)
  if (isNaN(expires) || Date.now() > expires) return false
  const expected = createHmac("sha256", getSecret()).update(`${swapId}:${action}:${step}:${expires}`).digest("hex")
  const expectedBuf = Buffer.from(expected, "hex")
  const sigBuf = Buffer.from(sig, "hex")
  if (expectedBuf.length !== sigBuf.length) return false
  return timingSafeEqual(expectedBuf, sigBuf)
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rl = rateLimit(`swap-action:${ip}`, 20)
  if (!rl.success) return rateLimitResponse()

  const { searchParams } = request.nextUrl
  const swapId = searchParams.get("id")
  const action = searchParams.get("action") as "approve" | "reject" | null
  const step = searchParams.get("step") as "manager" | "target" | null
  const token = searchParams.get("token")

  if (!swapId || !action || !step || !token || !["approve", "reject"].includes(action) || !["manager", "target"].includes(step)) {
    return new NextResponse(actionErrorPage("Invalid request."), { status: 400, headers: { "Content-Type": "text/html" } })
  }

  if (!verifySwapAction(swapId, action, step, token)) {
    return new NextResponse(actionErrorPage("Invalid or expired link."), { status: 403, headers: { "Content-Type": "text/html" } })
  }

  const admin = createAdminClient()

  // Fetch swap request
  const { data: swap } = await admin
    .from("swap_requests")
    .select("id, status, swap_type, initiator_staff_id, initiator_assignment_id, target_staff_id, target_assignment_id, swap_date, swap_shift_type, rota_id, organisation_id")
    .eq("id", swapId)
    .single() as { data: {
      id: string; status: string; swap_type: string
      initiator_staff_id: string; initiator_assignment_id: string
      target_staff_id: string | null; target_assignment_id: string | null
      swap_date: string; swap_shift_type: string; rota_id: string; organisation_id: string
    } | null }

  if (!swap) {
    return new NextResponse(actionErrorPage("Swap request not found."), { status: 404, headers: { "Content-Type": "text/html" } })
  }

  // Validate status matches expected step
  const expectedStatus = step === "manager" ? "pending_manager" : "pending_target"
  if (swap.status !== expectedStatus) {
    const alreadyMsg = swap.status === "approved" ? "already approved" : swap.status === "rejected" ? "already rejected" : `in status: ${swap.status}`
    return new NextResponse(actionResultPage(
      "Already processed",
      `This swap request has been ${alreadyMsg}.`,
      "#64748b"
    ), { headers: { "Content-Type": "text/html" } })
  }

  // === MANAGER STEP ===
  if (step === "manager") {
    if (action === "approve") {
      const reviewedAt = new Date().toISOString()
      await admin
        .from("swap_requests")
        .update({ status: "pending_target", manager_reviewed_at: reviewedAt })
        .eq("id", swapId)

      // Send email to target staff with accept/decline links.
      // If the email send fails, roll the status back so the swap isn't stuck
      // in pending_target with no way for the target to know about it.
      try {
        await sendSwapTargetEmail(swapId, swap.organisation_id)
      } catch (e) {
        console.error("[swap-action] Failed to send target email, rolling back status:", e)
        await admin
          .from("swap_requests")
          .update({ status: "pending_manager", manager_reviewed_at: null })
          .eq("id", swapId)
          .eq("status", "pending_target")
        return new NextResponse(actionErrorPage(
          "The swap was approved but the target staff member could not be notified. Please try again in a moment."
        ), { status: 502, headers: { "Content-Type": "text/html" } })
      }

      // In-app notification for target (best-effort — email is the source of truth)
      try {
        await notifySwapTarget(swapId, swap.organisation_id)
      } catch { /* notification failure should not block */ }

      return new NextResponse(actionResultPage(
        "Swap approved",
        "The swap has been approved. The target staff member will be notified to accept or decline.",
        "#059669"
      ), { headers: { "Content-Type": "text/html" } })
    } else {
      // Manager rejects
      await admin
        .from("swap_requests")
        .update({ status: "rejected", rejected_by: "manager", manager_reviewed_at: new Date().toISOString() })
        .eq("id", swapId)

      // Notify initiator
      try {
        await notifySwapInitiator(swapId, swap.organisation_id, "rejected")
      } catch { /* non-blocking */ }

      return new NextResponse(actionResultPage(
        "Swap rejected",
        "The swap request has been rejected.",
        "#ef4444"
      ), { headers: { "Content-Type": "text/html" } })
    }
  }

  // === TARGET STEP ===
  if (step === "target") {
    if (action === "approve") {
      // Execute the swap
      try {
        // Pass org explicitly — this route is HMAC-authenticated with no session cookie,
        // so executeSwap() would otherwise fail to resolve the org from getOrgId().
        const result = await executeSwap(swapId, swap.organisation_id)
        if (result.error) {
          return new NextResponse(actionErrorPage(result.error), { status: 400, headers: { "Content-Type": "text/html" } })
        }
      } catch (e) {
        console.error("[swap-action] Failed to execute swap:", e)
        return new NextResponse(actionErrorPage("Failed to execute the swap. Please try again or contact your manager."), { status: 500, headers: { "Content-Type": "text/html" } })
      }

      // Notify initiator
      try {
        await notifySwapInitiator(swapId, swap.organisation_id, "approved")
      } catch { /* non-blocking */ }

      return new NextResponse(actionResultPage(
        "Swap accepted",
        "The shift swap has been applied. The schedule has been updated.",
        "#059669"
      ), { headers: { "Content-Type": "text/html" } })
    } else {
      // Target declines
      await admin
        .from("swap_requests")
        .update({ status: "rejected", rejected_by: "target", target_responded_at: new Date().toISOString() })
        .eq("id", swapId)

      // Notify initiator
      try {
        await notifySwapInitiator(swapId, swap.organisation_id, "rejected")
      } catch { /* non-blocking */ }

      return new NextResponse(actionResultPage(
        "Swap declined",
        "The swap request has been declined.",
        "#ef4444"
      ), { headers: { "Content-Type": "text/html" } })
    }
  }

  return new NextResponse(actionErrorPage("Invalid request."), { status: 400, headers: { "Content-Type": "text/html" } })
}

