import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createHmac, timingSafeEqual } from "crypto"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { clearRotaAssignmentsForLeave } from "@/lib/leaves/clear-rota-assignments"
import { TOKEN_TTL_MS } from "@/lib/config"
import { notifyLeaveDecision } from "@/app/(clinic)/leaves/emails"
import { actionResultPage, actionErrorPage } from "@/lib/email-page"

function getSecret(): Buffer {
  const secret = process.env.LEAVE_TOKEN_SECRET
  if (!secret) throw new Error("LEAVE_TOKEN_SECRET env var is required")
  return Buffer.from(secret)
}


export function signLeaveAction(leaveId: string, action: "approve" | "reject"): string {
  const expires = Date.now() + TOKEN_TTL_MS
  return `${expires}.${createHmac("sha256", getSecret()).update(`${leaveId}:${action}:${expires}`).digest("hex")}`
}

function verifyLeaveAction(leaveId: string, action: string, token: string): boolean {
  const dotIdx = token.indexOf(".")
  if (dotIdx === -1) return false
  const expires = Number(token.slice(0, dotIdx))
  const sig = token.slice(dotIdx + 1)
  if (isNaN(expires) || Date.now() > expires) return false
  const expected = createHmac("sha256", getSecret()).update(`${leaveId}:${action}:${expires}`).digest("hex")
  const expectedBuf = Buffer.from(expected, "hex")
  const sigBuf = Buffer.from(sig, "hex")
  if (expectedBuf.length !== sigBuf.length) return false
  return timingSafeEqual(expectedBuf, sigBuf)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const leaveId = searchParams.get("id")
  const action = searchParams.get("action") as "approve" | "reject" | null
  const token = searchParams.get("token")

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rl = rateLimit(`leave-action:${ip}`, 20)
  if (!rl.success) return rateLimitResponse()

  if (!leaveId || !action || !token || !["approve", "reject"].includes(action)) {
    return new NextResponse(actionErrorPage("Invalid request."), { status: 400, headers: { "Content-Type": "text/html" } })
  }

  if (!verifyLeaveAction(leaveId, action, token)) {
    return new NextResponse(actionErrorPage("Invalid or expired link."), { status: 403, headers: { "Content-Type": "text/html" } })
  }

  const admin = createAdminClient()

  // Check leave exists and is still pending
  const { data: leave } = await admin
    .from("leaves")
    .select("id, status, staff_id, start_date, end_date, organisation_id")
    .eq("id", leaveId)
    .single() as { data: { id: string; status: string; staff_id: string; start_date: string; end_date: string; organisation_id: string } | null }

  if (!leave) {
    return new NextResponse(actionErrorPage("Leave request not found."), { status: 404, headers: { "Content-Type": "text/html" } })
  }

  if (leave.status !== "pending") {
    return new NextResponse(actionResultPage(
      leave.status === "approved" ? "Already approved" : "Already rejected",
      `This leave request has already been ${leave.status}.`,
      leave.status === "approved" ? "#059669" : "#64748b"
    ), { headers: { "Content-Type": "text/html" } })
  }

  const newStatus = action === "approve" ? "approved" : "rejected"
  const { error } = await admin
    .from("leaves")
    .update({ status: newStatus })
    .eq("id", leaveId)

  if (error) {
    return new NextResponse(actionErrorPage("Failed to update leave."), { status: 500, headers: { "Content-Type": "text/html" } })
  }

  await admin
    .from("leaves")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", leaveId)


  // If approved, remove conflicting rota assignments
  if (action === "approve") {
    await clearRotaAssignmentsForLeave({
      client: admin,
      orgId: leave.organisation_id,
      staffId: leave.staff_id,
      startDate: leave.start_date,
      endDate: leave.end_date,
      leaveId,
      trigger: "leave_approved",
    })
  }

  // Notify the staff member about the decision
  try {
    await notifyLeaveDecision({ leaveId, orgId: leave.organisation_id, decision: newStatus as "approved" | "rejected" })
  } catch { /* email failure should not block */ }

  const title = action === "approve" ? "Leave approved" : "Leave rejected"
  const desc = action === "approve"
    ? "The leave has been approved and the schedule updated."
    : "The leave request has been rejected."
  const color = action === "approve" ? "#059669" : "#ef4444"

  return new NextResponse(actionResultPage(title, desc, color), { headers: { "Content-Type": "text/html" } })
}
