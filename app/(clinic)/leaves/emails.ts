import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { formatDate, formatDateWithYear } from "@/lib/format-date"
import { sendEmail } from "@/lib/email"
import { APP_URL } from "@/lib/config"
import { getResendApiKey } from "@/lib/env"

const TYPE_LABELS: Record<string, { es: string; en: string }> = {
  annual:    { es: "Vacaciones",            en: "Annual leave" },
  sick:      { es: "Baja médica",           en: "Sick leave" },
  personal:  { es: "Asuntos propios",       en: "Personal leave" },
  training:  { es: "Formación",             en: "Training" },
  maternity: { es: "Maternidad/Paternidad", en: "Maternity/Paternity" },
  other:     { es: "Otros",                 en: "Other" },
}

const ROLE_LABELS: Record<string, { es: string; en: string }> = {
  lab:       { es: "Lab",        en: "Lab" },
  andrology: { es: "Andrología", en: "Andrology" },
  admin:     { es: "Admin",      en: "Admin" },
}

function dayCount(startDate: string, endDate: string): number {
  return Math.round(
    (new Date(endDate + "T12:00:00").getTime() - new Date(startDate + "T12:00:00").getTime()) / 86400000,
  ) + 1
}

async function sendResendEmail(to: string[], subject: string, html: string): Promise<void> {
  await sendEmail({ to, subject, html })
}

export async function sendLeaveRequestEmail(params: {
  to: string[]
  leaveId: string
  staffName: string
  staffRole: string
  type: string
  startDate: string
  endDate: string
  notes: string | null
  orgName: string
  locale: "es" | "en"
  overlapNames: string[]
  sameRoleOverlapCount: number
  totalActiveStaff: number
  overflowNote?: string
}) {
  if (!getResendApiKey()) return

  const { signLeaveAction } = await import("@/app/api/leave-action/route")
  const approveToken = signLeaveAction(params.leaveId, "approve")
  const rejectToken = signLeaveAction(params.leaveId, "reject")

  const baseUrl = APP_URL
  const approveUrl = `${baseUrl}/api/leave-action?id=${params.leaveId}&action=approve&token=${approveToken}`
  const rejectUrl = `${baseUrl}/api/leave-action?id=${params.leaveId}&action=reject&token=${rejectToken}`
  const appUrl = `${baseUrl}/leaves`

  const isEs = params.locale === "es"
  const typeLabel = TYPE_LABELS[params.type]?.[params.locale] ?? params.type
  const roleLabel = ROLE_LABELS[params.staffRole]?.[params.locale] ?? params.staffRole
  const days = dayCount(params.startDate, params.endDate)
  const fmtDate = (d: string) => formatDateWithYear(d + "T12:00:00", params.locale)

  let warningHtml = ""
  if (params.overlapNames.length > 0) {
    const warningTitle = isEs ? "Posible impacto en cobertura" : "Potential coverage impact"
    const alsoOff = isEs
      ? `También de ausencia en este período:`
      : `Also off during this period:`
    const sameRoleNote = params.sameRoleOverlapCount > 0
      ? (isEs
          ? `${params.sameRoleOverlapCount} persona${params.sameRoleOverlapCount > 1 ? "s" : ""} del mismo rol (${roleLabel}) también ausente${params.sameRoleOverlapCount > 1 ? "s" : ""}.`
          : `${params.sameRoleOverlapCount} ${roleLabel} team member${params.sameRoleOverlapCount > 1 ? "s" : ""} also off.`)
      : ""

    warningHtml = `
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:16px 0;">
        <p style="margin:0 0 6px;font-weight:600;color:#92400e;font-size:14px;">⚠️ ${warningTitle}</p>
        <p style="margin:0 0 4px;color:#78350f;font-size:13px;">${alsoOff}</p>
        <p style="margin:0 0 4px;color:#78350f;font-size:13px;font-weight:500;">${params.overlapNames.join(", ")}</p>
        ${sameRoleNote ? `<p style="margin:6px 0 0;color:#92400e;font-size:12px;font-weight:600;">${sameRoleNote}</p>` : ""}
      </div>`
  }

  let overflowNoteHtml = ""
  if (params.overflowNote) {
    const overflowTitle = isEs ? "Desborde de saldo" : "Balance overflow"
    overflowNoteHtml = `
      <div style="background:#eff6ff;border:1px solid #3b82f6;border-radius:8px;padding:12px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-weight:600;color:#1e40af;font-size:14px;">ℹ️ ${overflowTitle}</p>
        <p style="margin:0;color:#1e3a8a;font-size:13px;">${params.overflowNote}</p>
      </div>`
  }

  const subject = isEs
    ? `Solicitud de ausencia: ${params.staffName}`
    : `Leave request: ${params.staffName}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 16px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:24px;color:#1B4F8A;letter-spacing:-0.5px;">
      <span style="font-weight:300;">lab</span><span style="font-weight:700;">rota</span>
    </span>
  </div>

  <!-- Card -->
  <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

    <!-- Blue header strip -->
    <div style="background:#1B4F8A;padding:20px 24px;">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:600;">
        ${isEs ? "Nueva solicitud de ausencia" : "New leave request"}
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">
        ${params.orgName}
      </p>
    </div>

    <!-- Body -->
    <div style="padding:24px;">

      <p style="margin:0 0 20px;color:#334155;font-size:15px;">
        ${isEs
          ? `<strong>${params.staffName}</strong> ha solicitado una ausencia.`
          : `<strong>${params.staffName}</strong> has requested leave.`}
      </p>

      <!-- Details table -->
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;width:120px;">
            ${isEs ? "Tipo" : "Type"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${typeLabel}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Desde" : "From"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${fmtDate(params.startDate)}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Hasta" : "To"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${fmtDate(params.endDate)}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Duración" : "Duration"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${days} ${isEs ? (days === 1 ? "día" : "días") : (days === 1 ? "day" : "days")}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Rol" : "Role"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${roleLabel}
          </td>
        </tr>
        ${params.notes ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Notas" : "Notes"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#475569;font-style:italic;">
            ${params.notes}
          </td>
        </tr>` : ""}
      </table>

      ${warningHtml}
      ${overflowNoteHtml}

      <!-- Action buttons -->
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${approveUrl}" style="display:inline-block;background:#059669;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;margin-right:12px;">
          ${isEs ? "✓ Aprobar" : "✓ Approve"}
        </a>
        <a href="${rejectUrl}" style="display:inline-block;background:white;color:#dc2626;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;border:2px solid #fecaca;">
          ${isEs ? "✗ Rechazar" : "✗ Reject"}
        </a>
      </div>

      <p style="text-align:center;margin:16px 0 0;">
        <a href="${appUrl}" style="color:#1B4F8A;font-size:13px;text-decoration:underline;">
          ${isEs ? "Abrir LabRota" : "Open LabRota"}
        </a>
      </p>

    </div>
  </div>

  <!-- Footer -->
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">
    ${isEs ? "Este email fue enviado automáticamente por LabRota." : "This email was sent automatically by LabRota."}
  </p>

</div>
</body>
</html>`

  await sendResendEmail(params.to, subject, html)
}

export async function sendLeaveCancellationEmail(params: {
  to: string[]
  staffName: string
  type: string
  startDate: string
  endDate: string
  wasApproved: boolean
  orgName: string
  locale: "es" | "en"
}) {
  if (!getResendApiKey()) return

  const isEs = params.locale === "es"
  const baseUrl = APP_URL
  const typeLabel = TYPE_LABELS[params.type]?.[params.locale] ?? params.type
  const fmtDate = (d: string) => formatDate(d + "T12:00:00", params.locale)

  const statusNote = params.wasApproved
    ? (isEs ? "Esta ausencia ya estaba aprobada. Revisa el horario si es necesario." : "This leave was already approved. Review the schedule if needed.")
    : ""

  const subject = isEs
    ? `Ausencia cancelada: ${params.staffName}`
    : `Leave cancelled: ${params.staffName}`

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:24px;color:#1B4F8A;"><span style="font-weight:300;">lab</span><span style="font-weight:700;">rota</span></span>
  </div>
  <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#64748b;padding:20px 24px;">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:600;">${isEs ? "Ausencia cancelada" : "Leave cancelled"}</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${params.orgName}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#334155;font-size:15px;">
        ${isEs
          ? `<strong>${params.staffName}</strong> ha cancelado su ausencia.`
          : `<strong>${params.staffName}</strong> has cancelled their leave.`}
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;width:120px;">${isEs ? "Tipo" : "Type"}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${typeLabel}</td></tr>
        <tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Desde" : "From"}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${fmtDate(params.startDate)}</td></tr>
        <tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Hasta" : "To"}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${fmtDate(params.endDate)}</td></tr>
      </table>
      ${statusNote ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:0 0 16px;"><p style="margin:0;color:#92400e;font-size:13px;">⚠️ ${statusNote}</p></div>` : ""}
      <p style="text-align:center;margin:16px 0 0;"><a href="${baseUrl}/leaves" style="color:#1B4F8A;font-size:13px;text-decoration:underline;">${isEs ? "Abrir LabRota" : "Open LabRota"}</a></p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">${isEs ? "Este email fue enviado automáticamente por LabRota." : "This email was sent automatically by LabRota."}</p>
</div></body></html>`

  await sendResendEmail(params.to, subject, html)
}

export async function notifyLeaveDecision(params: {
  leaveId: string
  orgId: string
  decision: "approved" | "rejected"
}) {
  if (!getResendApiKey()) return

  const admin = createAdminClient()

  const { data: leave } = await admin
    .from("leaves")
    .select("staff_id, type, start_date, end_date")
    .eq("id", params.leaveId)
    .single() as { data: { staff_id: string; type: string; start_date: string; end_date: string } | null }

  if (!leave) return

  const [staffRes, orgRes, labConfigRes] = await Promise.all([
    admin.from("staff").select("first_name, last_name, email").eq("id", leave.staff_id).single(),
    admin.from("organisations").select("name").eq("id", params.orgId).single(),
    admin.from("lab_config").select("country").eq("organisation_id", params.orgId).maybeSingle(),
  ])

  const staffData = staffRes.data as { first_name: string; last_name: string; email: string | null } | null
  if (!staffData) return

  let staffEmail = staffData.email
  if (!staffEmail) {
    const { data: linked } = await admin
      .from("organisation_members")
      .select("user_id")
      .eq("organisation_id", params.orgId)
      .eq("linked_staff_id", leave.staff_id)
      .maybeSingle() as { data: { user_id: string } | null }
    if (linked) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", linked.user_id)
        .single() as { data: { email: string } | null }
      staffEmail = profile?.email ?? null
    }
  }

  if (!staffEmail) return

  const orgName = (orgRes.data as { name: string } | null)?.name ?? "LabRota"
  const country = (labConfigRes.data as { country?: string } | null)?.country ?? ""
  const locale: "es" | "en" = country === "ES" || country === "" ? "es" : "en"
  const isEs = locale === "es"

  const typeLabel = TYPE_LABELS[leave.type]?.[locale] ?? leave.type
  const fmtDate = (d: string) => formatDateWithYear(d + "T12:00:00", locale)
  const days = dayCount(leave.start_date, leave.end_date)

  const isApproved = params.decision === "approved"
  const headerColor = isApproved ? "#059669" : "#ef4444"
  const baseUrl = APP_URL

  const subject = isApproved
    ? (isEs ? `Ausencia aprobada` : `Leave approved`)
    : (isEs ? `Ausencia rechazada` : `Leave rejected`)

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:24px;color:#1B4F8A;"><span style="font-weight:300;">lab</span><span style="font-weight:700;">rota</span></span>
  </div>
  <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:${headerColor};padding:20px 24px;">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:600;">
        ${isApproved
          ? (isEs ? "Ausencia aprobada" : "Leave approved")
          : (isEs ? "Ausencia rechazada" : "Leave rejected")}
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${orgName}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 20px;color:#334155;font-size:15px;">
        ${isApproved
          ? (isEs ? `Tu solicitud de ausencia ha sido <strong>aprobada</strong>.` : `Your leave request has been <strong>approved</strong>.`)
          : (isEs ? `Tu solicitud de ausencia ha sido <strong>rechazada</strong>.` : `Your leave request has been <strong>rejected</strong>.`)}
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;width:120px;">${isEs ? "Tipo" : "Type"}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${typeLabel}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Desde" : "From"}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${fmtDate(leave.start_date)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Hasta" : "To"}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${fmtDate(leave.end_date)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Duración" : "Duration"}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${days} ${isEs ? (days === 1 ? "día" : "días") : (days === 1 ? "day" : "days")}</td>
        </tr>
      </table>
      ${!isApproved ? `
      <p style="margin:0 0 16px;color:#64748b;font-size:13px;">
        ${isEs ? "Si tienes dudas, contacta con tu responsable." : "If you have questions, please contact your manager."}
      </p>` : ""}
      <p style="text-align:center;margin:16px 0 0;">
        <a href="${baseUrl}/leaves" style="color:#1B4F8A;font-size:13px;text-decoration:underline;">${isEs ? "Abrir LabRota" : "Open LabRota"}</a>
      </p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">${isEs ? "Este email fue enviado automáticamente por LabRota." : "This email was sent automatically by LabRota."}</p>
</div></body></html>`

  await sendResendEmail([staffEmail], subject, html)
}
