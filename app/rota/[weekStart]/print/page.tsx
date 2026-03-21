import { notFound } from "next/navigation"
import { getLocale } from "next-intl/server"
import { getRotaWeek } from "@/app/(clinic)/rota/actions"
import { formatDateWithYear, formatDate } from "@/lib/format-date"

const ROLE_LABEL: Record<string, string> = { lab: "Lab", andrology: "Andrología", admin: "Admin" }
const ROLE_COLOR: Record<string, string> = {
  lab:       "#2563EB",
  andrology: "#059669",
  admin:     "#64748B",
}

export default async function PrintRotaPage({
  params,
}: {
  params: Promise<{ weekStart: string }>
}) {
  const { weekStart } = await params
  const locale = (await getLocale()) as "es" | "en"
  const data = await getRotaWeek(weekStart)

  if (!data.rota && data.days.every((d) => d.assignments.length === 0)) {
    notFound()
  }

  const weekEnd = new Date(weekStart + "T12:00:00")
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel = `${formatDate(weekStart, locale)} – ${formatDateWithYear(weekEnd.toISOString().split("T")[0], locale)}`
  const today = formatDateWithYear(new Date().toISOString().split("T")[0], locale)

  return (
    <>
      <style>{`
        @media print {
          .print-btn { display: none !important; }
          body { padding: 0 !important; }
          .print-page { padding: 0 !important; }
        }
      `}</style>

      <div className="print-page" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif", fontSize: 12, color: "#111", background: "#fff", padding: 24, maxWidth: 1100, margin: "0 auto" }}>

        {/* Print button */}
        <button
          className="print-btn"
          id="print-btn"
          style={{ display: "block", margin: "0 auto 20px", padding: "8px 20px", background: "#1b4f8a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
        >
          🖨 {locale === "es" ? "Imprimir / Guardar como PDF" : "Print / Save as PDF"}
        </button>
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById('print-btn').onclick=function(){window.print()}` }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #1b4f8a", paddingBottom: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1b4f8a", marginBottom: 4 }}>LabRota</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>{weekLabel}</div>
          </div>
          <div style={{ textAlign: "right", color: "#64748b", fontSize: 11, lineHeight: 1.6 }}>
            <div>{locale === "es" ? "Generado el" : "Generated on"}: {today}</div>
            {data.rota?.status === "published" && (
              <div style={{ color: "#059669", fontWeight: 600 }}>
                {locale === "es" ? "✓ Publicado" : "✓ Published"}
              </div>
            )}
          </div>
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: "1px solid #ccddee", borderRadius: 8, overflow: "hidden" }}>
          {data.days.map((day) => {
            const d = new Date(day.date + "T12:00:00")
            const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
            const dayNum = d.getDate()
            const isWeekend = day.isWeekend
            return (
              <div key={day.date} style={{ borderRight: "1px solid #ccddee" }}>
                <div style={{ padding: "8px 6px", textAlign: "center", background: isWeekend ? "#e8eef7" : "#f1f5fb", borderBottom: "1px solid #ccddee" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>{weekday}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1b4f8a", marginTop: 2 }}>{dayNum}</div>
                  {day.skillGaps.length > 0 && (
                    <div style={{ color: "#d97706", fontSize: 10, marginTop: 2 }}>⚠ {day.skillGaps.length} gap{day.skillGaps.length > 1 ? "s" : ""}</div>
                  )}
                </div>
                <div style={{ padding: 6, minHeight: 80, background: isWeekend ? "#f8fafd" : "#fff" }}>
                  {day.assignments.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: 11, textAlign: "center", padding: "12px 0" }}>—</div>
                  ) : (
                    day.assignments.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", borderRadius: 4, border: "1px solid #e2e8f0", marginBottom: 4, background: "#fff" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0, background: ROLE_COLOR[a.staff.role] + "20", color: ROLE_COLOR[a.staff.role] }}>
                          {a.staff.first_name[0]}{a.staff.last_name[0]}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 500 }}>{a.staff.first_name} {a.staff.last_name[0]}.</span>
                        <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, fontWeight: 600, marginLeft: "auto", background: ROLE_COLOR[a.staff.role] + "15", color: ROLE_COLOR[a.staff.role] }}>
                          {a.shift_type}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, color: "#94a3b8", fontSize: 10, borderTop: "1px solid #ccddee", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
          <span>LabRota</span>
          <span>{weekLabel}</span>
        </div>
      </div>
    </>
  )
}
