"use client"

import { Fragment } from "react"
import { useTranslations } from "next-intl"
import { ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  CoverageByDay,
  ShiftCoverageByDay,
  ShiftCoverageEntry,
  Department,
  ShiftTypeDefinition,
} from "@/lib/types/database"
import { DAY_KEYS, isWeekendKey } from "./shared"

type DayKey = typeof DAY_KEYS[number]

export function CoverageSection({
  coverageByDay,
  setCoverage,
  shiftCoverage,
  setShiftCov,
  shiftCoverageEnabled,
  onToggle,
  isByShift,
  hasShiftCoverage,
  shiftTypes,
  departments,
  disabled,
}: {
  coverageByDay: CoverageByDay
  setCoverage: (day: DayKey, role: "lab" | "andrology" | "admin", raw: string) => void
  shiftCoverage: ShiftCoverageByDay
  setShiftCov: (shiftCode: string, day: string, role: string, raw: string) => void
  shiftCoverageEnabled: boolean
  onToggle: () => void
  isByShift: boolean
  hasShiftCoverage: boolean
  shiftTypes: ShiftTypeDefinition[]
  departments: Department[]
  disabled: boolean
}) {
  const t = useTranslations("lab")
  const activeShifts = shiftTypes.filter((st) => st.active !== false)
  const showDeptTable = (!isByShift || !shiftCoverageEnabled) && !hasShiftCoverage
  const showShiftRoleTable = isByShift && shiftCoverageEnabled
  const showShiftDeptTable = hasShiftCoverage

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
          {t("sections.coverage")}
        </p>
        {isByShift && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{t("fields.byShiftToggle")}</span>
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                shiftCoverageEnabled ? "bg-emerald-500" : "bg-muted-foreground/20"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
                shiftCoverageEnabled ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          </div>
        )}
      </div>

      {showDeptTable && (
        <DepartmentTable
          coverageByDay={coverageByDay}
          setCoverage={setCoverage}
          disabled={disabled}
        />
      )}

      {showShiftRoleTable && (
        <ShiftRoleTable
          activeShifts={activeShifts}
          shiftCoverage={shiftCoverage}
          setShiftCov={setShiftCov}
          disabled={disabled}
        />
      )}

      {showShiftDeptTable && (
        <ShiftDepartmentTable
          activeShifts={activeShifts}
          departments={departments}
          shiftCoverage={shiftCoverage}
          setShiftCov={setShiftCov}
          disabled={disabled}
        />
      )}

      <p className="px-5 py-2 text-[11px] text-muted-foreground border-t border-border/50">
        {(isByShift && shiftCoverageEnabled) || hasShiftCoverage
          ? t("fields.coverageShiftFooter")
          : t("fields.coverageDeptFooter")}
      </p>
    </div>
  )
}

function DayHeader() {
  const t = useTranslations("lab")
  return (
    <>
      {DAY_KEYS.map((day) => (
        <th
          key={day}
          className={cn(
            "px-1 py-2 text-center font-medium text-muted-foreground w-[52px]",
            isWeekendKey(day) && "bg-muted/60"
          )}
        >
          {t(`days.${day}`).slice(0, 3)}
        </th>
      ))}
    </>
  )
}

function DepartmentTable({
  coverageByDay,
  setCoverage,
  disabled,
}: {
  coverageByDay: CoverageByDay
  setCoverage: (day: DayKey, role: "lab" | "andrology" | "admin", raw: string) => void
  disabled: boolean
}) {
  const t = useTranslations("lab")
  const roles = ["lab", "andrology", "admin"] as const
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">
              {t("fields.departmentColumn")}
            </th>
            <DayHeader />
          </tr>
        </thead>
        <tbody>
          {roles.map((role, rIdx) => {
            const label =
              role === "lab" ? t("fields.embryology")
              : role === "andrology" ? t("fields.andrology")
              : t("fields.administration")
            return (
              <tr key={role} className={cn("border-b border-border/50", rIdx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                <td className="px-3 py-1.5 font-medium text-[13px]">{label}</td>
                {DAY_KEYS.map((day) => (
                  <td key={day} className={cn("px-1 py-1 text-center", isWeekendKey(day) && "bg-muted/30")}>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={coverageByDay[day][role]}
                      onChange={(e) => setCoverage(day, role, e.target.value)}
                      disabled={disabled}
                      className="w-12 h-7 rounded border border-input bg-transparent text-center text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 disabled:opacity-50 mx-auto block"
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ShiftRoleTable({
  activeShifts,
  shiftCoverage,
  setShiftCov,
  disabled,
}: {
  activeShifts: ShiftTypeDefinition[]
  shiftCoverage: ShiftCoverageByDay
  setShiftCov: (shiftCode: string, day: string, role: string, raw: string) => void
  disabled: boolean
}) {
  const t = useTranslations("lab")
  const roles = [
    { key: "lab" as const,       label: t("fields.embrAbbr"), color: "var(--role-lab)" },
    { key: "andrology" as const, label: t("fields.andrAbbr"), color: "var(--role-andrology)" },
    { key: "admin" as const,     label: "Admin",              color: "var(--role-admin)" },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">{t("fields.shiftColumn")}</th>
            <DayHeader />
          </tr>
        </thead>
        <tbody>
          {activeShifts.map((st) => (
            <Fragment key={st.id}>
              <tr className="bg-muted/60 border-t border-border">
                <td colSpan={8} className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold">{st.code}</span>
                    <span className="text-[11px] text-muted-foreground">{st.start_time}–{st.end_time}</span>
                  </span>
                </td>
              </tr>
              {roles.map((role, rIdx) => (
                <tr key={`${st.id}-${role.key}`} className={cn("border-b border-border/30", rIdx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                  <td className="px-3 py-0.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                      <span className="text-[12px] text-muted-foreground">{role.label}</span>
                    </span>
                  </td>
                  {DAY_KEYS.map((day) => {
                    const entry = shiftCoverage[st.code]?.[day]
                    const covEntry = (typeof entry === "object" && entry !== null ? entry : {} as ShiftCoverageEntry)
                    const val = covEntry[role.key] ?? 0
                    return (
                      <td key={day} className={cn("px-1 py-0.5 text-center", isWeekendKey(day) && "bg-muted/30")}>
                        <div className="group relative flex items-center justify-center">
                          <button
                            type="button" tabIndex={-1}
                            onClick={() => setShiftCov(st.code, day, role.key, String(Math.max(0, val - 1)))}
                            className="absolute left-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground text-[10px] w-3 h-6 flex items-center justify-center"
                          >-</button>
                          <input
                            type="number" min={0} max={20} value={val || ""}
                            onChange={(e) => setShiftCov(st.code, day, role.key, e.target.value)}
                            disabled={disabled}
                            className={cn(
                              "no-spinners w-10 h-6 rounded border text-center text-[12px] outline-none disabled:opacity-50 mx-auto block",
                              val > 0 ? "border-input bg-background text-foreground" : "border-input bg-background text-muted-foreground/30",
                              "focus:border-ring focus:ring-1 focus:ring-ring/50"
                            )}
                          />
                          <button
                            type="button" tabIndex={-1}
                            onClick={() => setShiftCov(st.code, day, role.key, String(val + 1))}
                            className="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground text-[10px] w-3 h-6 flex items-center justify-center"
                          >+</button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ShiftDepartmentTable({
  activeShifts,
  departments,
  shiftCoverage,
  setShiftCov,
  disabled,
}: {
  activeShifts: ShiftTypeDefinition[]
  departments: Department[]
  shiftCoverage: ShiftCoverageByDay
  setShiftCov: (shiftCode: string, day: string, role: string, raw: string) => void
  disabled: boolean
}) {
  const t = useTranslations("lab")
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">{t("fields.shiftColumn")}</th>
            <DayHeader />
          </tr>
        </thead>
        <tbody>
          {activeShifts.map((st) => (
            <Fragment key={st.id}>
              <tr className="bg-muted/60 border-t border-border">
                <td colSpan={8} className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold">{st.name_es || st.code}</span>
                    <span className="text-[11px] text-muted-foreground">{st.start_time}–{st.end_time}</span>
                  </span>
                </td>
              </tr>
              {departments.map((dept, rIdx) => (
                <tr key={`${st.id}-${dept.code}`} className={cn("border-b border-border/30", rIdx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                  <td className="px-3 py-0.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: dept.colour }} />
                      <span className="text-[12px] text-muted-foreground">{dept.abbreviation}</span>
                    </span>
                  </td>
                  {DAY_KEYS.map((day) => {
                    const isActiveDay = st.active_days?.includes(day) ?? true
                    const entry = shiftCoverage[st.code]?.[day]
                    const covEntry = (typeof entry === "object" && entry !== null ? entry : {} as ShiftCoverageEntry)
                    const val = covEntry[dept.code] ?? 0
                    return (
                      <td key={day} className={cn("px-1 py-0.5 text-center", isWeekendKey(day) && "bg-muted/30")}>
                        {isActiveDay ? (
                          <div className="group flex items-center justify-center gap-0.5">
                            <input
                              type="number" min={0} max={20} value={val || ""}
                              onChange={(e) => setShiftCov(st.code, day, dept.code, e.target.value)}
                              disabled={disabled}
                              className={cn(
                                "no-spinners w-10 h-6 rounded border text-center text-[12px] outline-none disabled:opacity-50",
                                val > 0 ? "border-input bg-background text-foreground" : "border-input bg-background text-muted-foreground/30",
                                "focus:border-ring focus:ring-1 focus:ring-ring/50"
                              )}
                            />
                            <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button" tabIndex={-1}
                                onClick={() => setShiftCov(st.code, day, dept.code, String(val + 1))}
                                className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                              ><ChevronUp className="size-3" /></button>
                              <button
                                type="button" tabIndex={-1}
                                onClick={() => setShiftCov(st.code, day, dept.code, String(Math.max(0, val - 1)))}
                                className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                              ><ChevronDown className="size-3" /></button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
