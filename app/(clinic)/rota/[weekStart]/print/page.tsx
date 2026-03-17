import { notFound } from "next/navigation"
import { getLocale } from "next-intl/server"
import { getRotaWeek } from "@/app/(clinic)/rota/actions"
import { formatDateWithYear, formatDate } from "@/lib/format-date"

// ── Print trigger (auto-print disabled — user clicks the button) ──────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = { lab: "Lab", andrology: "Andrology", admin: "Admin" }
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

  const weekEnd   = new Date(weekStart + "T12:00:00")
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel = `${formatDate(weekStart, locale)} – ${formatDateWithYear(weekEnd.toISOString().split("T")[0], locale)}`
  const today     = formatDateWithYear(new Date().toISOString().split("T")[0], locale)

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>LabRota — {weekLabel}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
                 font-size: 12px; color: #111; background: #fff; padding: 24px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start;
                    border-bottom: 2px solid #1b4f8a; padding-bottom: 12px; margin-bottom: 16px; }
          .header h1 { font-size: 20px; font-weight: 700; color: #1b4f8a; }
          .header .meta { text-align: right; color: #64748b; font-size: 11px; line-height: 1.6; }
          .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0;
                  border: 1px solid #ccddee; border-radius: 8px; overflow: hidden; }
          .day { border-right: 1px solid #ccddee; }
          .day:last-child { border-right: none; }
          .day-header { padding: 8px 6px; text-align: center;
                        background: #f1f5fb; border-bottom: 1px solid #ccddee; }
          .day-header.weekend { background: #e8eef7; }
          .day-header .weekday { font-size: 10px; font-weight: 600; text-transform: uppercase;
                                  color: #64748b; letter-spacing: 0.05em; }
          .day-header .daynum  { font-size: 16px; font-weight: 700; color: #1b4f8a; margin-top: 2px; }
          .day-header .gap-warn { color: #d97706; font-size: 10px; margin-top: 2px; }
          .day-body { padding: 6px; min-height: 80px; }
          .day-body.weekend { background: #f8fafd; }
          .staff-chip { display: flex; align-items: center; gap: 5px; padding: 4px 6px;
                        border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 4px;
                        background: #fff; }
          .avatar { width: 20px; height: 20px; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 8px; font-weight: 700; flex-shrink: 0; }
          .staff-name { font-size: 11px; font-weight: 500; }
          .role-tag { font-size: 9px; padding: 1px 4px; border-radius: 3px;
                      font-weight: 600; margin-left: auto; }
          .empty { color: #94a3b8; font-size: 11px; text-align: center; padding: 12px 0; }
          .footer { margin-top: 16px; color: #94a3b8; font-size: 10px;
                    border-top: 1px solid #ccddee; padding-top: 8px;
                    display: flex; justify-content: space-between; }
          .print-btn { display: block; margin: 0 auto 20px;
                       padding: 8px 20px; background: #1b4f8a; color: #fff;
                       border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
          @media print {
            .print-btn { display: none !important; }
            body { padding: 0; }
          }
        `}</style>
      </head>
      <body>
        <button className="print-btn" onClick={() => {}} id="print-btn">
          🖨 Print / Save as PDF
        </button>
        <script dangerouslySetInnerHTML={{ __html: `
          document.getElementById('print-btn').onclick = function(){ window.print() }
        `}} />

        {/* Header */}
        <div className="header">
          <div>
            <div className="header h1" style={{ fontSize: 20, fontWeight: 700, color: "#1b4f8a", marginBottom: 4 }}>
              LabRota
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>{weekLabel}</div>
          </div>
          <div className="meta">
            <div>{locale === "es" ? "Generado el" : "Generated on"}: {today}</div>
            {data.rota?.status === "published" && (
              <div style={{ color: "#059669", fontWeight: 600 }}>
                {locale === "es" ? "✓ Publicado" : "✓ Published"}
              </div>
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="grid">
          {data.days.map((day) => {
            const d = new Date(day.date + "T12:00:00")
            const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
            const dayNum  = d.getDate()
            return (
              <div key={day.date} className="day">
                <div className={`day-header${day.isWeekend ? " weekend" : ""}`}>
                  <div className="weekday">{weekday}</div>
                  <div className="daynum">{dayNum}</div>
                  {day.skillGaps.length > 0 && (
                    <div className="gap-warn">⚠ {day.skillGaps.length} gap{day.skillGaps.length > 1 ? "s" : ""}</div>
                  )}
                </div>
                <div className={`day-body${day.isWeekend ? " weekend" : ""}`}>
                  {day.assignments.length === 0 ? (
                    <div className="empty">—</div>
                  ) : (
                    day.assignments.map((a) => (
                      <div key={a.id} className="staff-chip">
                        <div className="avatar" style={{ background: ROLE_COLOR[a.staff.role] + "20", color: ROLE_COLOR[a.staff.role] }}>
                          {a.staff.first_name[0]}{a.staff.last_name[0]}
                        </div>
                        <span className="staff-name">{a.staff.first_name} {a.staff.last_name[0]}.</span>
                        <span className="role-tag" style={{ background: ROLE_COLOR[a.staff.role] + "15", color: ROLE_COLOR[a.staff.role] }}>
                          {ROLE_LABEL[a.staff.role]}
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
        <div className="footer">
          <span>LabRota</span>
          <span>{weekLabel}</span>
        </div>
      </body>
    </html>
  )
}
