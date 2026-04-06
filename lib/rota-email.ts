import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import { formatDate, formatDateWithYear } from "@/lib/format-date"
import { formatTime } from "@/lib/format-time"

/**
 * Build LabRota-branded HTML email with the week schedule inline.
 */
export function buildRotaEmailHtml(params: {
  data: RotaWeekData
  orgName: string
  publisherName: string
  locale: "es" | "en"
  emailFormat?: "by_shift" | "by_person"
}): { subject: string; html: string } {
  const { data, orgName, publisherName, locale, emailFormat = "by_shift" } = params
  const isEs = locale === "es"

  const weekEnd = new Date(data.weekStart + "T12:00:00")
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel = `${formatDate(data.weekStart, locale)} – ${formatDateWithYear(weekEnd.toISOString().split("T")[0], locale)}`

  const subject = isEs
    ? `Horario publicado: ${weekLabel}`
    : `Rota published: ${weekLabel}`

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.labrota.app"

  // Build day headers
  const dayHeaders = data.days.map((day) => {
    const d = new Date(day.date + "T12:00:00")
    const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
    const dayNum = d.getDate()
    return `<th style="padding:6px 4px;text-align:center;border-right:1px solid #ccddee;border-bottom:1px solid #ccddee;background:${day.isWeekend ? '#e8eef7' : '#f1f5fb'};">
      <div style="font-size:9px;font-weight:600;color:#64748b;">${wday}</div>
      <div style="font-size:15px;font-weight:700;color:#1b4f8a;margin-top:1px;">${dayNum}</div>
    </th>`
  }).join("")

  // Build shift rows
  const shiftCodes = (data.shiftTypes ?? []).map((s) => s.code)
  const shiftTimes = data.shiftTimes ?? {}

  let gridHtml: string

  if (emailFormat === "by_person") {
    // By person layout — rows are staff members, columns are days
    // Collect all staff from assignments
    const staffMap = new Map<string, { id: string; first_name: string; last_name: string; role: string }>()
    for (const day of data.days) {
      for (const a of day.assignments) {
        if (!staffMap.has(a.staff_id)) staffMap.set(a.staff_id, a.staff)
      }
    }

    // Group by role and sort
    const roleOrder: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
    const ROLE_LABELS: Record<string, Record<string, string>> = {
      lab:       { es: "EMBRIOLOGÍA", en: "EMBRYOLOGY" },
      andrology: { es: "ANDROLOGÍA", en: "ANDROLOGY" },
      admin:     { es: "ADMINISTRACIÓN", en: "ADMINISTRATION" },
    }
    const staffList = Array.from(staffMap.values()).sort((a, b) => {
      const ro = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)
      if (ro !== 0) return ro
      return a.first_name.localeCompare(b.first_name)
    })

    // Build staff-by-day lookup
    const staffDayShift: Record<string, Record<string, string>> = {} // staffId -> date -> shiftCode
    for (const day of data.days) {
      for (const a of day.assignments) {
        if (!staffDayShift[a.staff_id]) staffDayShift[a.staff_id] = {}
        staffDayShift[a.staff_id][day.date] = a.shift_type
      }
    }

    // On leave lookup
    const onLeave = data.onLeaveByDate ?? {}

    // Build rows grouped by role
    let currentRole = ""
    const personRows = staffList.map((s) => {
      let roleHeader = ""
      if (s.role !== currentRole) {
        currentRole = s.role
        const label = ROLE_LABELS[s.role]?.[locale] ?? s.role.toUpperCase()
        roleHeader = `<tr>
          <td colspan="${data.days.length + 1}" style="padding:6px 8px 3px;font-size:10px;font-weight:700;color:#64748b;background:#f8fafd;border-bottom:1px solid #ccddee;">
            ${label}
          </td>
        </tr>`
      }

      const cells = data.days.map((day) => {
        const shift = staffDayShift[s.id]?.[day.date]
        const isOnLeave = (onLeave[day.date] ?? []).includes(s.id)
        let content: string
        if (isOnLeave) {
          content = `<span style="color:#f59e0b;font-weight:600;font-size:10px;">L</span>`
        } else if (shift) {
          content = `<span style="color:#1b4f8a;font-weight:600;font-size:11px;">${shift}</span>`
        } else {
          content = `<span style="color:#94a3b8;font-size:10px;">OFF</span>`
        }
        return `<td style="padding:4px 2px;text-align:center;border-right:1px solid #ccddee;background:${day.isWeekend ? '#f8fafd' : '#fff'};">
          ${content}
        </td>`
      }).join("")

      return `${roleHeader}<tr style="border-bottom:1px solid #ccddee;">
        <td style="padding:4px 8px;border-right:1px solid #ccddee;background:#fff;font-size:11px;font-weight:500;white-space:nowrap;">
          ${s.first_name} ${s.last_name[0]}.
        </td>
        ${cells}
      </tr>`
    }).join("")

    gridHtml = `<table style="min-width:500px;width:100%;border-collapse:collapse;border:1px solid #ccddee;" cellpadding="0" cellspacing="0">
      <thead><tr style="background:#f1f5fb;">
        <th style="padding:6px 8px;border-right:1px solid #ccddee;border-bottom:1px solid #ccddee;text-align:left;font-size:9px;font-weight:600;color:#64748b;"></th>
        ${dayHeaders}
      </tr></thead>
      <tbody>${personRows}</tbody>
    </table>`
  } else if (data.rotaDisplayMode === "by_task") {
    // By task layout
    const tecnicas = (data.tecnicas ?? []).filter((t: { activa: boolean }) => t.activa).sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden)
    const taskHeaders = data.days.map((day) => {
      const d = new Date(day.date + "T12:00:00")
      const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
      const dayNum = d.getDate()
      return `<th style="padding:6px 4px;text-align:center;border-right:1px solid #ccddee;border-bottom:1px solid #ccddee;background:${day.isWeekend ? '#e8eef7' : '#f1f5fb'};">
        <div style="font-size:9px;font-weight:600;color:#64748b;">${wday}</div>
        <div style="font-size:15px;font-weight:700;color:#1b4f8a;margin-top:1px;">${dayNum}</div>
      </th>`
    }).join("")

    const taskRows = tecnicas.map((t: { id: string; nombre_es: string; codigo: string }) => {
      const cells = data.days.map((day) => {
        const assigns = day.assignments.filter((a) => a.function_label === t.codigo)
        const names = assigns.map((a) => `${a.staff.first_name} ${a.staff.last_name[0]}.`)
        return `<td style="padding:4px;border-right:1px solid #ccddee;vertical-align:top;font-size:10px;background:${day.isWeekend ? '#f8fafd' : '#fff'};">
          ${names.length === 0 ? '<span style="color:#cbd5e1;">—</span>' : names.join(" / ")}
        </td>`
      }).join("")
      return `<tr style="border-bottom:1px solid #ccddee;">
        <td style="padding:4px 6px;border-right:1px solid #ccddee;background:#f8fafd;font-size:10px;font-weight:600;">${t.nombre_es}</td>
        ${cells}
      </tr>`
    }).join("")

    gridHtml = `<table style="min-width:600px;width:100%;border-collapse:collapse;border:1px solid #ccddee;" cellpadding="0" cellspacing="0">
      <thead><tr style="background:#f1f5fb;">
        <th style="width:100px;padding:6px 4px;border-right:1px solid #ccddee;border-bottom:1px solid #ccddee;text-align:left;font-size:9px;font-weight:600;color:#64748b;">${isEs ? "Técnica" : "Task"}</th>
        ${taskHeaders}
      </tr></thead>
      <tbody>${taskRows}</tbody>
    </table>`
  } else {
    // By shift layout
    const shiftRows = shiftCodes.map((shiftCode) => {
      const time = shiftTimes[shiftCode]
      const timeHtml = time
        ? `<div style="font-size:12px;font-weight:600;color:#1b4f8a;line-height:1.2;">${formatTime(time.start, data.timeFormat)}</div>
           <div style="font-size:10px;color:#94a3b8;">${formatTime(time.end, data.timeFormat)}</div>`
        : ""

      const cells = data.days.map((day) => {
        const dayAssignments = day.assignments
          .filter((a) => a.shift_type === shiftCode)

        if (dayAssignments.length === 0) {
          return `<td style="padding:4px;border-right:1px solid #ccddee;vertical-align:top;background:${day.isWeekend ? '#f8fafd' : '#fff'};">
            <div style="color:#cbd5e1;font-size:10px;text-align:center;padding:8px 0;">—</div>
          </td>`
        }

        const namesHtml = dayAssignments.map((a) => {
          return `<div style="padding:2px 4px;margin-bottom:1px;font-size:11px;font-weight:500;">
            ${a.staff.first_name} ${a.staff.last_name[0]}.
          </div>`
        }).join("")

        return `<td style="padding:4px;border-right:1px solid #ccddee;vertical-align:top;background:${day.isWeekend ? '#f8fafd' : '#fff'};">
          ${namesHtml}
        </td>`
      }).join("")

      return `<tr style="border-bottom:1px solid #ccddee;">
        <td style="padding:6px;border-right:1px solid #ccddee;background:#f8fafd;text-align:right;vertical-align:top;">
          <div style="font-size:9px;color:#64748b;font-weight:600;">${shiftCode}</div>
          ${timeHtml}
        </td>
        ${cells}
      </tr>`
    }).join("")

    gridHtml = `<table style="min-width:600px;width:100%;border-collapse:collapse;border:1px solid #ccddee;" cellpadding="0" cellspacing="0">
      <thead><tr style="background:#f1f5fb;">
        <th style="width:70px;padding:6px 4px;border-right:1px solid #ccddee;border-bottom:1px solid #ccddee;"></th>
        ${dayHeaders}
      </tr></thead>
      <tbody>${shiftRows}</tbody>
    </table>`
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:32px 16px;">

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
        ${isEs ? "Horario publicado" : "Rota published"}
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">
        ${orgName} · ${weekLabel}
      </p>
    </div>

    <!-- Body -->
    <div style="padding:24px;">

      <p style="margin:0 0 20px;color:#334155;font-size:14px;">
        ${isEs
          ? `<strong>${publisherName}</strong> ha publicado el horario de la semana <strong>${weekLabel}</strong>.`
          : `<strong>${publisherName}</strong> has published the rota for <strong>${weekLabel}</strong>.`}
      </p>

      <!-- Schedule grid -->
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
      ${gridHtml}
      </div>

      <p style="text-align:center;margin:24px 0 0;">
        <a href="${baseUrl}/schedule" style="display:inline-block;background:#1B4F8A;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
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

  return { subject, html }
}

/**
 * Send rota publish notification emails via Resend.
 * Fire-and-forget — errors are logged but don't throw.
 */
export async function sendRotaPublishEmails(params: {
  emails: string[]
  data: RotaWeekData
  orgName: string
  publisherName: string
  locale: "es" | "en"
  emailFormat?: "by_shift" | "by_person"
}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || params.emails.length === 0) return

  const { subject, html } = buildRotaEmailHtml(params)

  try {
    // Resend supports up to 50 recipients per call
    const batches: string[][] = []
    for (let i = 0; i < params.emails.length; i += 50) {
      batches.push(params.emails.slice(i, i + 50))
    }

    for (const batch of batches) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "LabRota <noreply@labrota.app>",
          to: batch,
          subject,
          html,
        }),
      })
    }
  } catch (err) {
    console.error("[rota-email] Failed to send publish notifications:", err)
  }
}
