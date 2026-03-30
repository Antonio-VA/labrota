import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createHmac } from "crypto"

const SECRET = process.env.SUPABASE_SECRET_KEY ?? ""

export function signLeaveAction(leaveId: string, action: "approve" | "reject"): string {
  return createHmac("sha256", SECRET).update(`${leaveId}:${action}`).digest("hex")
}

export function verifyLeaveAction(leaveId: string, action: string, token: string): boolean {
  const expected = createHmac("sha256", SECRET).update(`${leaveId}:${action}`).digest("hex")
  return expected === token
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const leaveId = searchParams.get("id")
  const action = searchParams.get("action") as "approve" | "reject" | null
  const token = searchParams.get("token")

  if (!leaveId || !action || !token || !["approve", "reject"].includes(action)) {
    return new NextResponse(errorPage("Invalid request."), { status: 400, headers: { "Content-Type": "text/html" } })
  }

  if (!verifyLeaveAction(leaveId, action, token)) {
    return new NextResponse(errorPage("Invalid or expired link."), { status: 403, headers: { "Content-Type": "text/html" } })
  }

  const admin = createAdminClient()

  // Check leave exists and is still pending
  const { data: leave } = await admin
    .from("leaves")
    .select("id, status, staff_id, start_date, end_date, organisation_id")
    .eq("id", leaveId)
    .single() as { data: { id: string; status: string; staff_id: string; start_date: string; end_date: string; organisation_id: string } | null }

  if (!leave) {
    return new NextResponse(errorPage("Leave request not found."), { status: 404, headers: { "Content-Type": "text/html" } })
  }

  if (leave.status !== "pending") {
    return new NextResponse(resultPage(
      leave.status === "approved" ? "Already approved" : "Already rejected",
      `This leave request has already been ${leave.status}.`,
      leave.status === "approved" ? "#059669" : "#64748b"
    ), { headers: { "Content-Type": "text/html" } })
  }

  const newStatus = action === "approve" ? "approved" : "rejected"
  const { error } = await admin
    .from("leaves")
    .update({ status: newStatus } as never)
    .eq("id", leaveId)

  if (error) {
    return new NextResponse(errorPage("Failed to update leave."), { status: 500, headers: { "Content-Type": "text/html" } })
  }

  // If approved, remove conflicting rota assignments
  if (action === "approve") {
    await admin
      .from("rota_assignments")
      .delete()
      .eq("staff_id", leave.staff_id)
      .eq("organisation_id", leave.organisation_id)
      .gte("date", leave.start_date)
      .lte("date", leave.end_date)
  }

  const title = action === "approve" ? "Leave approved" : "Leave rejected"
  const desc = action === "approve"
    ? "The leave has been approved and the schedule updated."
    : "The leave request has been rejected."
  const color = action === "approve" ? "#059669" : "#ef4444"

  return new NextResponse(resultPage(title, desc, color), { headers: { "Content-Type": "text/html" } })
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
<a href="https://app.labrota.app/leaves" style="display:inline-block;background:#1B4F8A;color:white;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;">Open LabRota</a>
</div></body></html>`
}

function errorPage(message: string) {
  return resultPage("Error", message, "#ef4444")
}
