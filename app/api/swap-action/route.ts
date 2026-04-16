import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createHmac } from "crypto"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

const SECRET = process.env.SUPABASE_SECRET_KEY ?? ""
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function signSwapAction(swapId: string, action: "approve" | "reject", step: "manager" | "target"): string {
  const expires = Date.now() + TOKEN_TTL_MS
  return `${expires}.${createHmac("sha256", SECRET).update(`${swapId}:${action}:${step}:${expires}`).digest("hex")}`
}

function verifySwapAction(swapId: string, action: string, step: string, token: string): boolean {
  const dotIdx = token.indexOf(".")
  if (dotIdx === -1) return false
  const expires = Number(token.slice(0, dotIdx))
  const sig = token.slice(dotIdx + 1)
  if (isNaN(expires) || Date.now() > expires) return false
  const expected = createHmac("sha256", SECRET).update(`${swapId}:${action}:${step}:${expires}`).digest("hex")
  return expected === sig
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
    return new NextResponse(errorPage("Invalid request."), { status: 400, headers: { "Content-Type": "text/html" } })
  }

  if (!verifySwapAction(swapId, action, step, token)) {
    return new NextResponse(errorPage("Invalid or expired link."), { status: 403, headers: { "Content-Type": "text/html" } })
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
    return new NextResponse(errorPage("Swap request not found."), { status: 404, headers: { "Content-Type": "text/html" } })
  }

  // Validate status matches expected step
  const expectedStatus = step === "manager" ? "pending_manager" : "pending_target"
  if (swap.status !== expectedStatus) {
    const alreadyMsg = swap.status === "approved" ? "already approved" : swap.status === "rejected" ? "already rejected" : `in status: ${swap.status}`
    return new NextResponse(resultPage(
      "Already processed",
      `This swap request has been ${alreadyMsg}.`,
      "#64748b"
    ), { headers: { "Content-Type": "text/html" } })
  }

  // === MANAGER STEP ===
  if (step === "manager") {
    if (action === "approve") {
      await admin
        .from("swap_requests")
        .update({ status: "pending_target", manager_reviewed_at: new Date().toISOString() })
        .eq("id", swapId)

      // Send email to target staff with accept/decline links
      try {
        const { sendSwapTargetEmail } = await import("@/lib/swap-email")
        await sendSwapTargetEmail(swapId, swap.organisation_id)
      } catch (e) { console.error("[swap-action] Failed to send target email:", e) }

      // In-app notification for target
      try {
        const { notifySwapTarget } = await import("@/lib/swap-email")
        await notifySwapTarget(swapId, swap.organisation_id)
      } catch { /* notification failure should not block */ }

      return new NextResponse(resultPage(
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
        const { notifySwapInitiator } = await import("@/lib/swap-email")
        await notifySwapInitiator(swapId, swap.organisation_id, "rejected")
      } catch { /* non-blocking */ }

      return new NextResponse(resultPage(
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
        const { executeSwap } = await import("@/app/(clinic)/swaps/actions")
        const result = await executeSwap(swapId)
        if (result.error) {
          return new NextResponse(errorPage(result.error), { status: 400, headers: { "Content-Type": "text/html" } })
        }
      } catch (e) {
        console.error("[swap-action] Failed to execute swap:", e)
        return new NextResponse(errorPage("Failed to execute the swap. Please try again or contact your manager."), { status: 500, headers: { "Content-Type": "text/html" } })
      }

      // Notify initiator
      try {
        const { notifySwapInitiator } = await import("@/lib/swap-email")
        await notifySwapInitiator(swapId, swap.organisation_id, "approved")
      } catch { /* non-blocking */ }

      return new NextResponse(resultPage(
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
        const { notifySwapInitiator } = await import("@/lib/swap-email")
        await notifySwapInitiator(swapId, swap.organisation_id, "rejected")
      } catch { /* non-blocking */ }

      return new NextResponse(resultPage(
        "Swap declined",
        "The swap request has been declined.",
        "#ef4444"
      ), { headers: { "Content-Type": "text/html" } })
    }
  }

  return new NextResponse(errorPage("Invalid request."), { status: 400, headers: { "Content-Type": "text/html" } })
}

function resultPage(title: string, description: string, accentColor: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — LabRota</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="background:white;border-radius:16px;padding:40px;max-width:400px;width:90%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.1);border:1px solid #e2e8f0;">
<div style="width:48px;height:48px;border-radius:50%;background:${accentColor}15;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
</div>
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#0f172a;">${title}</h1>
<p style="margin:0 0 24px;font-size:14px;color:#64748b;">${description}</p>
<a href="https://www.labrota.app" style="display:inline-block;background:#1B4F8A;color:white;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;">Open LabRota</a>
</div></body></html>`
}

function errorPage(message: string) {
  return resultPage("Error", message, "#ef4444")
}
