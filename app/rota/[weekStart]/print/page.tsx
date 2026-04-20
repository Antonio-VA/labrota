export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { getRotaWeek } from "@/app/(clinic)/rota/actions"
import { formatDateWithYear, formatDate, toISODate } from "@/lib/format-date"
import { DEFAULT_DEPT_BORDER, DEFAULT_DEPT_LABEL } from "@/lib/department-colors"
import { createClient } from "@/lib/supabase/server"
import { formatTime } from "@/lib/format-time"

export default async function PrintRotaPage({
  params,
}: {
  params: Promise<{ weekStart: string }>
}) {
  const { weekStart } = await params
  const locale = (await getLocale()) as "es" | "en"
  const t = await getTranslations("schedule")
  const data = await getRotaWeek(weekStart)

  // Fetch org name
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let orgName = "LabRota"
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("organisation_id").eq("id", user.id).single() as { data: { organisation_id: string | null } | null }
    if (profile?.organisation_id) {
      const { data: org } = await supabase.from("organisations").select("name").eq("id", profile.organisation_id).single() as { data: { name: string } | null }
      if (org) orgName = org.name
    }
  }

  if (!data.rota && data.days.every((d) => d.assignments.length === 0)) {
    notFound()
  }

  const weekEnd = new Date(weekStart + "T12:00:00")
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel = `${formatDate(weekStart, locale)} – ${formatDateWithYear(toISODate(weekEnd), locale)}`
  const today = formatDateWithYear(toISODate(), locale)

  // Department colours from DB or fallback
  const deptBorder: Record<string, string> = { ...DEFAULT_DEPT_BORDER }
  const deptLabel: Record<string, string> = { ...DEFAULT_DEPT_LABEL }
  for (const d of data.departments ?? []) {
    deptBorder[d.code] = d.colour
    deptLabel[d.code] = d.name
  }

  // Técnica lookup for chip colours and names
  const tecnicas = data.tecnicas ?? []
  const tecnicaByCode = Object.fromEntries(tecnicas.map((t) => [t.codigo, t]))

  // Shift types
  const shiftTypes = data.shiftTypes ?? []
  const shiftTimes = data.shiftTimes ?? {}

  // Collect all shift codes that have assignments
  const shiftCodes = shiftTypes.map((s) => s.code)

  // Técnica pill colours (inline-safe hex values)
  const PILL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    amber:  { bg: "#fef3c7", text: "#92400e", border: "#fbbf24" },
    blue:   { bg: "#dbeafe", text: "#1e40af", border: "#60a5fa" },
    green:  { bg: "#d1fae5", text: "#065f46", border: "#34d399" },
    purple: { bg: "#ede9fe", text: "#5b21b6", border: "#a78bfa" },
    coral:  { bg: "#fee2e2", text: "#991b1b", border: "#f87171" },
    teal:   { bg: "#ccfbf1", text: "#134e4a", border: "#2dd4bf" },
    slate:  { bg: "#f1f5f9", text: "#475569", border: "#94a3b8" },
    red:    { bg: "#fee2e2", text: "#991b1b", border: "#ef4444" },
  }

  return (
    <>
      <style>{`
        @media print {
          .print-btn { display: none !important; }
          body { padding: 0 !important; }
          .print-page { padding: 12px !important; }
        }
      `}</style>

      <div className="print-page" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif", fontSize: 12, color: "#111", background: "#fff", padding: 24, maxWidth: 1200, margin: "0 auto" }}>

        {/* Print button */}
        <button className="print-btn" id="print-btn"
          style={{ display: "block", margin: "0 auto 20px", padding: "8px 20px", background: "#1b4f8a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
          🖨 {t("printOrSavePdf")}
        </button>
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById('print-btn').onclick=function(){window.print()}` }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #1b4f8a", paddingBottom: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1b4f8a", marginBottom: 2 }}>{orgName}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{weekLabel}</div>
          </div>
          <div style={{ textAlign: "right", color: "#64748b", fontSize: 10, lineHeight: 1.6 }}>
            <div>{t("generatedOn")}: {today}</div>
            {data.rota?.status === "published" && (
              <div style={{ color: "#059669", fontWeight: 600 }}>
                ✓ {t("published")}
                {data.rota.published_by && ` · ${data.rota.published_by}`}
              </div>
            )}
          </div>
        </div>

        {/* Grid */}
        {data.rotaDisplayMode === "by_task" ? (
        /* ── BY TASK grid ─────────────────────────────────────────── */
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #ccddee", borderRadius: 6, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#f1f5fb" }}>
              <th style={{ width: 100, padding: "6px 4px", borderRight: "1px solid #ccddee", borderBottom: "1px solid #ccddee", textAlign: "left", fontSize: 9, fontWeight: 600, color: "#64748b" }}>Técnica</th>
              {data.days.map((day) => {
                const d = new Date(day.date + "T12:00:00")
                const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
                const dayNum = d.getDate()
                return (
                  <th key={day.date} style={{ padding: "6px 4px", textAlign: "center", borderRight: "1px solid #ccddee", borderBottom: "1px solid #ccddee", background: day.isWeekend ? "#e8eef7" : "#f1f5fb" }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#64748b" }}>{wday}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1b4f8a", marginTop: 1 }}>{dayNum}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {(tecnicas ?? []).filter((t: { activa: boolean }) => t.activa).sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden).map((tecnica: { id: string; nombre_es: string; codigo: string; color: string }) => (
              <tr key={tecnica.id} style={{ borderBottom: "1px solid #ccddee" }}>
                <td style={{ padding: "4px 6px", borderRight: "1px solid #ccddee", background: "#f8fafd", fontSize: 10, fontWeight: 600 }}>{tecnica.nombre_es}</td>
                {data.days.map((day) => {
                  const techAssignments = day.assignments.filter((a) => a.function_label === tecnica.codigo)
                  const names = techAssignments.map((a) => `${a.staff.first_name} ${a.staff.last_name[0]}.`)
                  return (
                    <td key={day.date} style={{ padding: "4px", borderRight: "1px solid #ccddee", verticalAlign: "top", fontSize: 10, background: day.isWeekend ? "#f8fafd" : "#fff" }}>
                      {names.length === 0 ? (
                        <span style={{ color: "#cbd5e1" }}>—</span>
                      ) : (
                        names.join(" / ")
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        ) : (
        /* ── BY SHIFT grid ────────────────────────────────────────── */
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #ccddee", borderRadius: 6, overflow: "hidden" }}>
          {/* Day headers */}
          <thead>
            <tr style={{ background: "#f1f5fb" }}>
              <th style={{ width: 70, padding: "6px 4px", borderRight: "1px solid #ccddee", borderBottom: "1px solid #ccddee" }} />
              {data.days.map((day) => {
                const d = new Date(day.date + "T12:00:00")
                const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
                const dayNum = d.getDate()
                const isToday = day.date === toISODate()
                return (
                  <th key={day.date} style={{
                    padding: "6px 4px", textAlign: "center",
                    borderRight: "1px solid #ccddee", borderBottom: "1px solid #ccddee",
                    background: day.isWeekend ? "#e8eef7" : "#f1f5fb",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>{wday}</div>
                    <div style={{
                      fontSize: 15, fontWeight: 700, marginTop: 1,
                      color: isToday ? "#fff" : day.isWeekend ? "#94a3b8" : "#1b4f8a",
                      ...(isToday ? { background: "#1b4f8a", borderRadius: "50%", width: 24, height: 24, lineHeight: "24px", margin: "2px auto 0", textAlign: "center" as const } : {}),
                    }}>{dayNum}</div>
                    <div style={{ fontSize: 8, color: "#94a3b8", marginTop: 1 }}>
                      P:{data.punctionsDefault[day.date] ?? 0}
                    </div>
                    {day.skillGaps.length > 0 && (
                      <div style={{ color: "#d97706", fontSize: 9, marginTop: 1 }}>⚠ {day.skillGaps.length}</div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Shift rows */}
          <tbody>
            {shiftCodes.map((shiftCode) => {
              const _shiftDef = shiftTypes.find((s) => s.code === shiftCode)
              const time = shiftTimes[shiftCode]
              return (
                <tr key={shiftCode} style={{ borderBottom: "1px solid #ccddee" }}>
                  {/* Shift label */}
                  <td style={{
                    padding: "6px 6px", borderRight: "1px solid #ccddee",
                    background: "#f8fafd", textAlign: "right", verticalAlign: "top",
                  }}>
                    <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>{shiftCode}</div>
                    {time && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1b4f8a", lineHeight: 1.2 }}>{formatTime(time.start, data.timeFormat)}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{formatTime(time.end, data.timeFormat)}</div>
                      </>
                    )}
                  </td>

                  {/* Day cells */}
                  {data.days.map((day) => {
                    const dayAssignments = day.assignments
                      .filter((a) => a.shift_type === shiftCode)
                      .sort((a, b) => {
                        const order: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
                        return (order[a.staff.role] ?? 9) - (order[b.staff.role] ?? 9)
                      })

                    return (
                      <td key={day.date} style={{
                        padding: 4, borderRight: "1px solid #ccddee",
                        verticalAlign: "top", minHeight: 40,
                        background: day.isWeekend ? "#f8fafd" : "#fff",
                      }}>
                        {dayAssignments.length === 0 ? (
                          <div style={{ color: "#cbd5e1", fontSize: 10, textAlign: "center", padding: "8px 0" }}>—</div>
                        ) : dayAssignments.map((a) => {
                          const borderColor = deptBorder[a.staff.role] ?? "#94A3B8"
                          const tec = a.function_label ? tecnicaByCode[a.function_label] : null
                          const pillStyle = tec ? PILL_COLORS[tec.color] ?? PILL_COLORS.blue : null

                          return (
                            <div key={a.id} style={{
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "3px 5px 3px 6px", marginBottom: 3,
                              borderLeft: `3px solid ${borderColor}`, borderRadius: 3,
                              border: "1px solid #e2e8f0",
                              borderLeftWidth: 3, borderLeftColor: borderColor,
                              background: "#fff", fontSize: 11,
                            }}>
                              <span style={{ fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.staff.first_name} {a.staff.last_name[0]}.
                              </span>
                              {pillStyle && tec && (
                                <span style={{
                                  fontSize: 8, fontWeight: 700, padding: "1px 4px",
                                  borderRadius: 3, border: `1px solid ${pillStyle.border}`,
                                  background: pillStyle.bg, color: pillStyle.text,
                                  flexShrink: 0,
                                }}>
                                  {tec.codigo}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        )}

        {/* Shift budget summary removed — not needed in print */}

        {/* Footer */}
        <div style={{ marginTop: 12, color: "#94a3b8", fontSize: 9, borderTop: "1px solid #ccddee", paddingTop: 6, textAlign: "center" }}>
          LabRota
        </div>
      </div>
    </>
  )
}
