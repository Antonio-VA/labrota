import { createAdminClient } from "@/lib/supabase/admin"
import { formatDate } from "@/lib/format-date"
import type { SwapRequest } from "@/lib/types/database"

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSwapContext(swapId: string, orgId: string) {
  const admin = createAdminClient()

  const [swapRes, orgRes, configRes] = await Promise.all([
    admin.from("swap_requests").select("*").eq("id", swapId).single(),
    admin.from("organisations").select("name").eq("id", orgId).single(),
    admin.from("lab_config").select("country").eq("organisation_id", orgId).maybeSingle(),
  ])

  const swap = swapRes.data as SwapRequest | null
  if (!swap) return null

  const orgName = (orgRes.data as { name: string } | null)?.name ?? "LabRota"
  const country = (configRes.data as { country?: string } | null)?.country ?? ""
  const locale: "es" | "en" = country === "ES" || country === "" ? "es" : "en"

  // Get staff names
  const staffIds = [swap.initiator_staff_id, swap.target_staff_id].filter(Boolean) as string[]
  const { data: staffList } = await admin
    .from("staff")
    .select("id, first_name, last_name, email, role")
    .in("id", staffIds) as { data: Array<{ id: string; first_name: string; last_name: string; email: string | null; role: string }> | null }

  const staffMap = new Map((staffList ?? []).map(s => [s.id, s]))
  const initiator = staffMap.get(swap.initiator_staff_id)
  const target = swap.target_staff_id ? staffMap.get(swap.target_staff_id) : null

  return { swap, orgName, locale, initiator, target }
}

async function getManagerEmails(orgId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: members } = await admin
    .from("organisation_members")
    .select("user_id, role")
    .eq("organisation_id", orgId)
    .in("role", ["admin", "manager"]) as { data: Array<{ user_id: string; role: string }> | null }

  if (!members || members.length === 0) return []

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", members.map(m => m.user_id)) as { data: Array<{ id: string; email: string }> | null }

  return (profiles ?? []).map(p => p.email).filter(Boolean)
}

async function getStaffEmail(staffId: string, orgId: string): Promise<string | null> {
  const admin = createAdminClient()

  // Check staff.email first
  const { data: staff } = await admin
    .from("staff")
    .select("email")
    .eq("id", staffId)
    .single() as { data: { email: string | null } | null }

  if (staff?.email) return staff.email

  // Check linked user via organisation_members
  const { data: member } = await admin
    .from("organisation_members")
    .select("user_id")
    .eq("organisation_id", orgId)
    .eq("linked_staff_id", staffId)
    .maybeSingle() as { data: { user_id: string } | null }

  if (member) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", member.user_id)
      .single() as { data: { email: string } | null }
    return profile?.email ?? null
  }

  return null
}

async function sendEmail(to: string[], subject: string, html: string) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || to.length === 0) return

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "LabRota <noreply@labrota.app>", to, subject, html }),
  })
}

function emailWrapper(headerColor: string, title: string, orgName: string, bodyHtml: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:24px;color:#1B4F8A;"><span style="font-weight:300;">lab</span><span style="font-weight:700;">rota</span></span>
  </div>
  <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:${headerColor};padding:20px 24px;">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:600;">${title}</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${orgName}</p>
    </div>
    <div style="padding:24px;">${bodyHtml}</div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">LabRota</p>
</div></body></html>`
}

function actionButton(label: string, url: string, color: string) {
  return `<a href="${url}" style="display:inline-block;background:${color};color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;margin:0 6px;">${label}</a>`
}

// ── Send email to managers ───────────────────────────────────────────────────

export async function sendSwapManagerEmail(swapId: string, orgId: string) {
  const ctx = await getSwapContext(swapId, orgId)
  if (!ctx) return

  const { swap, orgName, locale, initiator, target } = ctx
  const isEs = locale === "es"
  const emails = await getManagerEmails(orgId)
  if (emails.length === 0) return

  const { signSwapAction } = await import("@/app/api/swap-action/route")
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.labrota.app"
  const approveUrl = `${baseUrl}/api/swap-action?id=${swapId}&action=approve&step=manager&token=${signSwapAction(swapId, "approve", "manager")}`
  const rejectUrl = `${baseUrl}/api/swap-action?id=${swapId}&action=reject&step=manager&token=${signSwapAction(swapId, "reject", "manager")}`

  const initiatorName = initiator ? `${initiator.first_name} ${initiator.last_name}` : "Unknown"
  const targetName = target ? `${target.first_name} ${target.last_name}` : "Unknown"
  const dateLabel = formatDate(swap.swap_date, locale)

  const swapTypeLabel = swap.swap_type === "shift_swap"
    ? (isEs ? "Cambio de turno" : "Shift swap")
    : (isEs ? "Día libre (cobertura)" : "Day off (coverage)")

  const descriptionHtml = swap.swap_type === "shift_swap"
    ? (isEs
      ? `<strong>${initiatorName}</strong> quiere intercambiar su turno <strong>${swap.swap_shift_type}</strong> con el turno de <strong>${targetName}</strong> el <strong>${dateLabel}</strong>.`
      : `<strong>${initiatorName}</strong> wants to swap their <strong>${swap.swap_shift_type}</strong> shift with <strong>${targetName}</strong>'s shift on <strong>${dateLabel}</strong>.`)
    : (isEs
      ? `<strong>${initiatorName}</strong> solicita el día libre el <strong>${dateLabel}</strong>. <strong>${targetName}</strong> cubriría su turno <strong>${swap.swap_shift_type}</strong>.`
      : `<strong>${initiatorName}</strong> requests the day off on <strong>${dateLabel}</strong>. <strong>${targetName}</strong> would cover their <strong>${swap.swap_shift_type}</strong> shift.`)

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#334155;font-size:15px;">${descriptionHtml}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;width:120px;">${isEs ? "Tipo" : "Type"}</td>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${swapTypeLabel}</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Fecha" : "Date"}</td>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${dateLabel}</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Turno" : "Shift"}</td>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${swap.swap_shift_type}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0 8px;">
      ${actionButton(isEs ? "Aprobar" : "Approve", approveUrl, "#059669")}
      ${actionButton(isEs ? "Rechazar" : "Reject", rejectUrl, "#ef4444")}
    </div>`

  const subject = isEs
    ? `Solicitud de cambio: ${initiatorName}`
    : `Swap request: ${initiatorName}`

  const title = isEs ? "Nueva solicitud de cambio de turno" : "New shift swap request"

  await sendEmail(emails, subject, emailWrapper("#1B4F8A", title, orgName, bodyHtml))
}

// ── Send email to target staff ───────────────────────────────────────────────

export async function sendSwapTargetEmail(swapId: string, orgId: string) {
  const ctx = await getSwapContext(swapId, orgId)
  if (!ctx || !ctx.target) return

  const { swap, orgName, locale, initiator, target } = ctx
  const isEs = locale === "es"

  const targetEmail = await getStaffEmail(target.id, orgId)
  if (!targetEmail) return

  const { signSwapAction } = await import("@/app/api/swap-action/route")
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.labrota.app"
  const acceptUrl = `${baseUrl}/api/swap-action?id=${swapId}&action=approve&step=target&token=${signSwapAction(swapId, "approve", "target")}`
  const declineUrl = `${baseUrl}/api/swap-action?id=${swapId}&action=reject&step=target&token=${signSwapAction(swapId, "reject", "target")}`

  const initiatorName = initiator ? `${initiator.first_name} ${initiator.last_name}` : "Unknown"
  const dateLabel = formatDate(swap.swap_date, locale)

  const descriptionHtml = swap.swap_type === "shift_swap"
    ? (isEs
      ? `<strong>${initiatorName}</strong> quiere intercambiar turnos contigo el <strong>${dateLabel}</strong>. Tu turno actual: <strong>${swap.swap_shift_type}</strong>.`
      : `<strong>${initiatorName}</strong> wants to swap shifts with you on <strong>${dateLabel}</strong>. Your current shift: <strong>${swap.swap_shift_type}</strong>.`)
    : (isEs
      ? `<strong>${initiatorName}</strong> necesita el día libre el <strong>${dateLabel}</strong> y te pide que cubras su turno <strong>${swap.swap_shift_type}</strong>.`
      : `<strong>${initiatorName}</strong> needs the day off on <strong>${dateLabel}</strong> and is asking you to cover their <strong>${swap.swap_shift_type}</strong> shift.`)

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#334155;font-size:15px;">${descriptionHtml}</p>
    <p style="margin:0 0 24px;color:#64748b;font-size:13px;">${isEs ? "Tu responsable ya ha aprobado esta solicitud." : "Your manager has already approved this request."}</p>
    <div style="text-align:center;margin:24px 0 8px;">
      ${actionButton(isEs ? "Aceptar" : "Accept", acceptUrl, "#059669")}
      ${actionButton(isEs ? "Rechazar" : "Decline", declineUrl, "#ef4444")}
    </div>`

  const subject = isEs
    ? `Solicitud de cambio de ${initiatorName}`
    : `Swap request from ${initiatorName}`

  const title = isEs ? "Solicitud de cambio de turno" : "Shift swap request"

  await sendEmail([targetEmail], subject, emailWrapper("#1B4F8A", title, orgName, bodyHtml))
}

// ── Notify initiator of result ───────────────────────────────────────────────

export async function notifySwapInitiator(swapId: string, orgId: string, result: "approved" | "rejected") {
  const ctx = await getSwapContext(swapId, orgId)
  if (!ctx || !ctx.initiator) return

  const { swap, orgName, locale, initiator, target } = ctx
  const isEs = locale === "es"

  const initiatorEmail = await getStaffEmail(initiator.id, orgId)
  if (!initiatorEmail) return

  const isApproved = result === "approved"
  const targetName = target ? `${target.first_name} ${target.last_name}` : "Unknown"
  const dateLabel = formatDate(swap.swap_date, locale)

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#334155;font-size:15px;">
      ${isApproved
        ? (isEs
          ? `Tu solicitud de cambio de turno con <strong>${targetName}</strong> el <strong>${dateLabel}</strong> ha sido <strong>aprobada</strong>. El horario ha sido actualizado.`
          : `Your shift swap request with <strong>${targetName}</strong> on <strong>${dateLabel}</strong> has been <strong>approved</strong>. The schedule has been updated.`)
        : (isEs
          ? `Tu solicitud de cambio de turno con <strong>${targetName}</strong> el <strong>${dateLabel}</strong> ha sido <strong>rechazada</strong>.`
          : `Your shift swap request with <strong>${targetName}</strong> on <strong>${dateLabel}</strong> has been <strong>rejected</strong>.`)}
    </p>
    <p style="text-align:center;margin:16px 0 0;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.labrota.app"}" style="color:#1B4F8A;font-size:13px;text-decoration:underline;">${isEs ? "Abrir LabRota" : "Open LabRota"}</a>
    </p>`

  const headerColor = isApproved ? "#059669" : "#ef4444"
  const subject = isApproved
    ? (isEs ? "Cambio de turno aprobado" : "Shift swap approved")
    : (isEs ? "Cambio de turno rechazado" : "Shift swap rejected")
  const title = subject

  await sendEmail([initiatorEmail], subject, emailWrapper(headerColor, title, orgName, bodyHtml))

  // Also create in-app notification
  try {
    const admin = createAdminClient()
    const { data: member } = await admin
      .from("organisation_members")
      .select("user_id")
      .eq("organisation_id", orgId)
      .eq("linked_staff_id", initiator.id)
      .maybeSingle() as { data: { user_id: string } | null }

    if (member) {
      await admin.from("notifications").insert({
        organisation_id: orgId,
        user_id: member.user_id,
        type: isApproved ? "swap_approved" : "swap_rejected",
        title: isApproved ? "Shift swap approved" : "Shift swap rejected",
        message: isApproved
          ? `Your swap with ${targetName} on ${dateLabel} has been approved.`
          : `Your swap with ${targetName} on ${dateLabel} has been rejected.`,
        data: { swapId, date: swap.swap_date },
      } as never)
    }
  } catch { /* notification failure is non-blocking */ }
}

// ── Notify managers (in-app) ─────────────────────────────────────────────────

export async function notifySwapManagers(swapId: string, orgId: string) {
  const ctx = await getSwapContext(swapId, orgId)
  if (!ctx || !ctx.initiator) return

  const { swap, locale, initiator } = ctx
  const initiatorName = `${initiator.first_name} ${initiator.last_name}`
  const dateLabel = formatDate(swap.swap_date, locale)

  const admin = createAdminClient()
  const { data: members } = await admin
    .from("organisation_members")
    .select("user_id, role")
    .eq("organisation_id", orgId)
    .in("role", ["admin", "manager"]) as { data: Array<{ user_id: string; role: string }> | null }

  if (!members || members.length === 0) return

  const notifications = members.map(m => ({
    organisation_id: orgId,
    user_id: m.user_id,
    type: "swap_request",
    title: "New swap request",
    message: `${initiatorName} requested a shift swap on ${dateLabel}.`,
    data: { swapId, date: swap.swap_date },
  }))

  await admin.from("notifications").insert(notifications as never)
}

// ── Notify target (in-app) ───────────────────────────────────────────────────

export async function notifySwapTarget(swapId: string, orgId: string) {
  const ctx = await getSwapContext(swapId, orgId)
  if (!ctx || !ctx.target || !ctx.initiator) return

  const { swap, locale, initiator, target } = ctx
  const initiatorName = `${initiator.first_name} ${initiator.last_name}`
  const dateLabel = formatDate(swap.swap_date, locale)

  const admin = createAdminClient()
  const { data: member } = await admin
    .from("organisation_members")
    .select("user_id")
    .eq("organisation_id", orgId)
    .eq("linked_staff_id", target.id)
    .maybeSingle() as { data: { user_id: string } | null }

  if (!member) return

  await admin.from("notifications").insert({
    organisation_id: orgId,
    user_id: member.user_id,
    type: "swap_pending_target",
    title: "Swap request for you",
    message: `${initiatorName} wants to swap shifts with you on ${dateLabel}. Check your email to accept or decline.`,
    data: { swapId, date: swap.swap_date },
  } as never)
}

// ── Resend rota email with swap notice ───────────────────────────────────────

export async function resendRotaWithSwapNotice(rotaId: string, orgId: string) {
  const { getEnabledRecipientEmails } = await import("@/app/(clinic)/notifications-actions")
  const { sendRotaPublishEmails } = await import("@/lib/rota-email")

  const admin = createAdminClient()

  const emails = await getEnabledRecipientEmails(orgId)
  if (emails.length === 0) return

  // Get rota week_start
  const { data: rota } = await admin
    .from("rotas")
    .select("week_start")
    .eq("id", rotaId)
    .single() as { data: { week_start: string } | null }
  if (!rota) return

  const { data: org } = await admin
    .from("organisations")
    .select("name, rota_email_format")
    .eq("id", orgId)
    .single() as { data: { name: string; rota_email_format?: string } | null }

  const { data: config } = await admin
    .from("lab_config")
    .select("country")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { country?: string } | null }

  const orgName = org?.name ?? "LabRota"
  const country = config?.country ?? ""
  const locale: "es" | "en" = country === "ES" || country === "" ? "es" : "en"
  const emailFormat = (org?.rota_email_format as "by_shift" | "by_person") ?? "by_shift"

  // Fetch fresh rota data via admin — we may be in API route context without session cookies
  const { getRotaWeek } = await import("@/app/(clinic)/rota/actions")
  const data = await getRotaWeek(rota.week_start)

  await sendRotaPublishEmails({
    emails,
    data,
    orgName,
    publisherName: locale === "es" ? "Cambio de turno" : "Shift swap",
    locale,
    emailFormat,
  })
}
