"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { X, CalendarPlus, CalendarX, Clock, Star, ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatDateRange, formatDateWithYear, toISODate } from "@/lib/format-date"
import { useUserRole } from "@/lib/role-context"
import { getStaffProfile, type RotaWeekData, type StaffProfileData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { InlineLeaveForm } from "./inline-leave-form"
import { ProfileSkillsSection } from "./profile-skills-section"
import { TODAY, DAY_ES_2 } from "../constants"
import { buildDeptMaps, makeSkillLabel } from "../utils"

export function StaffProfilePanel({
  staffId, staffList, weekData, open, onClose, onRefreshWeek,
}: {
  staffId: string | null
  staffList: StaffWithSkills[]
  weekData: RotaWeekData | null
  open: boolean
  onClose: () => void
  onRefreshWeek?: () => void
}) {
  const localeRaw = useLocale()
  const locale    = localeRaw as "es" | "en"
  const t         = useTranslations("schedule")
  const tStaff    = useTranslations("staff")
  const tl        = useTranslations("leaves")
  const tLab      = useTranslations("lab")
  const userRole  = useUserRole()
  const [data, setData]       = useState<StaffProfileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAdjWeeks, setShowAdjWeeks] = useState(false)
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const skillsDirtyRef = useRef(false)

  const handleClose = useCallback(() => {
    if (skillsDirtyRef.current) {
      if (!window.confirm(t("unsavedSkillChanges"))) return
    }
    onClose()
  }, [onClose, t])

  const weekStart = weekData?.weekStart ?? null
  useEffect(() => {
    if (!staffId || !open) return
     
    setData(null)
    setLoading(true)
    getStaffProfile(staffId, weekStart ?? undefined).then((d) => { setData(d); setLoading(false) })
  }, [staffId, open, weekStart])

  const staff = staffId ? staffList.find((s) => s.id === staffId) : null
  const deptMaps = buildDeptMaps(weekData?.departments ?? [], locale)
  const ROLE_LABEL = deptMaps.label
  const ROLE_BORDER = deptMaps.border

  // Weekly shift strip: this person's assignments for the current visible week
  const weekDays = weekData?.days ?? []
  const DOW_SHORT = locale === "es"
    ? ["L", "M", "X", "J", "V", "S", "D"]
    : ["M", "T", "W", "T", "F", "S", "S"]

  const skillLabel = makeSkillLabel(weekData?.tecnicas ?? [])

  // Tenure in years + months
  const tenureLabel = staff ? (() => {
    const start = new Date(staff.start_date + "T12:00:00")
    const now = new Date()
    let years = now.getFullYear() - start.getFullYear()
    let months = now.getMonth() - start.getMonth()
    if (months < 0) { years--; months += 12 }
    return years > 0 ? `${years}a ${months}m` : `${months}m`
  })() : null

  return (
    <>
      {/* Overlay */}
      {open && <div className="fixed inset-0 z-40" onClick={handleClose} />}

      {/* Side panel — 400px */}
      <div className={cn(
        "fixed right-0 top-0 bottom-0 z-50 bg-background border-l border-border shadow-xl",
        "flex flex-col transition-transform duration-200 ease-out w-[400px]",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          {/* Role dot + avatar placeholder */}
          <div
            className="size-10 rounded-full flex items-center justify-center text-[14px] font-semibold text-white shrink-0"
            style={{ background: staff ? (ROLE_BORDER[staff.role] ?? "#94A3B8") : "#94A3B8" }}
          >
            {staff ? `${staff.first_name[0]}${staff.last_name[0]}` : "—"}
          </div>
          <div className="flex-1 min-w-0">
            {staff ? (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[14px] font-medium truncate">{staff.first_name} {staff.last_name}</p>
                  {(() => {
                    const deptTecs = (weekData?.tecnicas ?? []).filter((tc) => tc.activa && tc.department.split(",").includes(staff.role))
                    const certCodes = new Set(staff.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill))
                    const allCertified = staff.role !== "admin" && deptTecs.length > 0 && deptTecs.every((tc) => certCodes.has(tc.codigo))
                    return allCertified ? (
                      <Tooltip>
                        <TooltipTrigger render={<Star className="size-3.5 text-amber-400 fill-amber-400 shrink-0" />} />
                        <TooltipContent side="right">Todas las técnicas validadas</TooltipContent>
                      </Tooltip>
                    ) : null
                  })()}
                  {staff.contract_type === "part_time" && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 shrink-0">PT</span>
                  )}
                  {staff.contract_type === "intern" && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 shrink-0">INT</span>
                  )}
                  {(() => {
                    const end = staff.onboarding_end_date
                    const today = toISODate()
                    if (end && today <= end) return (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">ONBOARDING</span>
                    )
                    return null
                  })()}
                  {staff.prefers_guardia === true && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 shrink-0">G</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{ROLE_LABEL[staff.role] ?? staff.role}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{staff.days_per_week}d/sem</span>
                </div>
              </>
            ) : (
              <div className="shimmer-bar h-4 w-32 rounded" />
            )}
          </div>
          <button onClick={handleClose} className="size-7 flex items-center justify-center rounded hover:bg-muted shrink-0">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Weekly shift strips — current + collapsible prev/next */}
          <div className="px-5 py-3 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{t("currentWeek")}</p>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => {
                const a = day.assignments.find((a) => a.staff_id === staffId)
                const onLeave = weekData?.onLeaveByDate[day.date]?.includes(staffId ?? "") ?? false
                const isToday = day.date === TODAY
                return (
                  <div key={day.date} className="flex flex-col items-center gap-0.5">
                    <span className={cn(
                      "text-[10px] font-medium leading-none",
                      isToday ? "text-primary" : "text-muted-foreground"
                    )}>
                      {DOW_SHORT[i]}
                    </span>
                    <div className={cn(
                      "w-full h-7 rounded flex items-center justify-center text-[10px] font-semibold",
                      a ? "bg-primary/10 text-primary border border-primary/20"
                        : onLeave ? "bg-amber-50 text-amber-600 border border-amber-200"
                        : "bg-muted text-muted-foreground/40 border border-border/50"
                    )}>
                      {a ? a.shift_type : onLeave ? t("leave") : "—"}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Collapsible prev/next weeks */}
            <button
              onClick={() => setShowAdjWeeks(!showAdjWeeks)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-2 w-full"
            >
              {showAdjWeeks ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              <span>{t("previousWeek")} / {t("nextWeek")}</span>
            </button>

            {showAdjWeeks && (
              <div className="mt-2 flex flex-col gap-3">
                {/* Previous week */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("previousWeek")}</p>
                  {loading ? (
                    <div className="shimmer-bar h-7 w-full rounded" />
                  ) : (
                    <div className="grid grid-cols-7 gap-1 opacity-60">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const ws = weekStart ? new Date(weekStart + "T12:00:00") : new Date()
                        const d = new Date(ws); d.setDate(d.getDate() - 7 + i)
                        const dateStr = toISODate(d)
                        const a = (data?.prevWeekAssignments ?? []).find((a) => a.date === dateStr)
                        return (
                          <div key={i} className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-medium leading-none text-muted-foreground">{DOW_SHORT[i]}</span>
                            <div className={cn(
                              "w-full h-7 rounded flex items-center justify-center text-[10px] font-semibold",
                              a ? "bg-muted text-foreground/60 border border-border"
                                : "bg-muted/50 text-muted-foreground/30 border border-border/30"
                            )}>
                              {a ? a.shift_type : "—"}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {/* Next week */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("nextWeek")}</p>
                  {loading ? (
                    <div className="shimmer-bar h-7 w-full rounded" />
                  ) : (
                    <div className="grid grid-cols-7 gap-1 opacity-60">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const ws = weekStart ? new Date(weekStart + "T12:00:00") : new Date()
                        const d = new Date(ws); d.setDate(d.getDate() + 7 + i)
                        const dateStr = toISODate(d)
                        const a = (data?.nextWeekAssignments ?? []).find((a) => a.date === dateStr)
                        return (
                          <div key={i} className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-medium leading-none text-muted-foreground">{DOW_SHORT[i]}</span>
                            <div className={cn(
                              "w-full h-7 rounded flex items-center justify-center text-[10px] font-semibold",
                              a ? "bg-muted text-foreground/60 border border-border"
                                : "bg-muted/50 text-muted-foreground/30 border border-border/30"
                            )}>
                              {a ? a.shift_type : "—"}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Capacidades (skills) — editable */}
          {staff && (
            <ProfileSkillsSection
              staffId={staffId!}
              staffSkills={staff.staff_skills}
              tecnicas={weekData?.tecnicas ?? []}
              skillLabel={skillLabel}
              canEdit={userRole !== "viewer"}
              dirtyRef={skillsDirtyRef}
              onChanged={() => {
                // Refresh the staff list so chips update everywhere
                onRefreshWeek?.()
              }}
            />
          )}

          {/* Scheduling rules affecting this person — managers/admins only */}
          {staff && userRole !== "viewer" && (
            <div className="px-5 py-3 border-b border-border">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{t("activeRules")}</p>
              {loading ? (
                <div className="shimmer-bar h-4 w-40 rounded" />
              ) : !data?.rules?.length ? (
                <p className="text-[12px] text-muted-foreground italic">{t("noActiveRules")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.rules.map((rule, i) => {
                    const otherStaff = rule.staff_ids
                      .filter((id) => id !== staffId)
                      .map((id) => staffList.find((s) => s.id === id))
                      .filter(Boolean)
                    const otherNames = otherStaff.map((s) => `${s!.first_name} ${s!.last_name[0]}.`).join(", ")
                    // Extract day pattern from various param keys
                    const dayKeys = ["supervisorDays", "fixedDays", "restrictedDays", "days"] as const
                    const ruleDays = dayKeys.reduce<string[]>((acc, k) => acc.length > 0 ? acc : ((rule.params[k] as string[] | undefined) ?? []), [])
                    const dayStr = ruleDays.length > 0 ? ruleDays.map((d) => DAY_ES_2[d] ?? d).join(", ") : ""
                    // Extra info: training technique, fixed shift
                    const trainingTec = rule.params.training_tecnica_code as string | undefined
                    const tecLabel = trainingTec ? (weekData?.tecnicas?.find((tc) => tc.codigo === trainingTec)?.nombre_es ?? trainingTec) : null
                    const fixedShift = rule.params.fixedShift as string | undefined
                    const detail = [otherNames, dayStr ? `(${dayStr})` : "", tecLabel, fixedShift].filter(Boolean).join(" · ")
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <div className={cn(
                          "mt-1 size-1.5 rounded-full shrink-0",
                          rule.is_hard ? "bg-red-400" : "bg-amber-400"
                        )} />
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-foreground">{tLab(`rules.types.${rule.type}`)}</p>
                          {detail && (
                            <p className="text-[11px] text-muted-foreground truncate">{detail}</p>
                          )}
                          {rule.expires_at && (
                            <p className="text-[11px] text-muted-foreground">
                              <Clock className="inline size-2.5 mr-0.5 -mt-0.5" />
                              {formatDateWithYear(rule.expires_at, locale)}
                            </p>
                          )}
                          {rule.notes && (
                            <p className="text-[11px] text-muted-foreground italic truncate">{rule.notes}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming leaves */}
          <div className="px-5 py-3 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{t("upcomingLeaves")}</p>
            {loading ? (
              <div className="shimmer-bar h-4 w-40 rounded" />
            ) : !data?.upcomingLeaves.length ? (
              <p className="text-[12px] text-muted-foreground italic">{t("noLeavesScheduled")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.upcomingLeaves.map((leave, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CalendarX className="size-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[12px] text-foreground">{formatDateRange(leave.start_date, leave.end_date, locale)}</p>
                      <p className="text-[11px] text-muted-foreground">{tl(`types.${leave.type}`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past leaves */}
          <div className="px-5 py-3 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{t("pastLeaves")}</p>
            {loading ? (
              <div className="shimmer-bar h-4 w-40 rounded" />
            ) : !data?.pastLeaves?.length ? (
              <p className="text-[12px] text-muted-foreground italic">{t("noRecords")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.pastLeaves.map((leave, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CalendarX className="size-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[12px] text-foreground">{formatDateRange(leave.start_date, leave.end_date, locale)}</p>
                      <p className="text-[11px] text-muted-foreground">{tl(`types.${leave.type}`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key info */}
          {staff && (
            <div className="px-5 py-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{t("information")}</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[12px]">
                <div>
                  <p className="text-muted-foreground">{tStaff("fields.startDate")}</p>
                  <p className="text-foreground font-medium">{formatDateWithYear(staff.start_date, locale)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("seniority")}</p>
                  <p className="text-foreground font-medium">{tenureLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("daysPerWeek")}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <p className="text-foreground font-medium">{staff.days_per_week ?? 5} {t("daysPerWeek")}</p>
                    {staff.contract_type === "part_time" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">{tStaff("contractType.part_time")}</span>
                    )}
                    {staff.contract_type === "intern" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">{tStaff("contractType.intern")}</span>
                    )}
                  </div>
                </div>
                {(() => {
                  const end = staff.onboarding_end_date
                  const today = toISODate()
                  if (!end) return null
                  return (
                    <div>
                      <p className="text-muted-foreground">{tStaff("fields.onboardingPeriod")}</p>
                      <p className={`text-[12px] font-medium ${today <= end ? "text-amber-600" : "text-muted-foreground"}`}>
                        {formatDateWithYear(end, locale)}
                        {today <= end ? ` (${tStaff("onboardingStatus.active")})` : ` (${t("done")})`}
                      </p>
                    </div>
                  )
                })()}
                <div>
                  <p className="text-muted-foreground">{tStaff("daysAvailable")}</p>
                  <p className="text-foreground font-medium">{(staff.working_pattern ?? []).map((d) => DAY_ES_2[d] ?? d).join(", ")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("preferredShift")}</p>
                  {staff.preferred_shift ? (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {staff.preferred_shift.split(",").filter(Boolean).map((s) => (
                        <span key={s} className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {s.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-foreground font-medium">{t("noPreference")}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">{t("dayPreferences")}</p>
                  {(staff.preferred_days?.length ?? 0) > 0 || (staff.avoid_days?.length ?? 0) > 0 ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      {(staff.preferred_days ?? []).map((d) => (
                        <span key={d} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[var(--pref-bg)] text-white">{DAY_ES_2[d] ?? d}</span>
                      ))}
                      {(staff.avoid_days ?? []).map((d) => (
                        <span key={d} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C]">{DAY_ES_2[d] ?? d}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-foreground font-medium">{t("noPreference")}</p>
                  )}
                </div>
                {staff.end_date && (
                  <div>
                    <p className="text-muted-foreground">{t("endDate")}</p>
                    <p className="text-foreground font-medium">{formatDateWithYear(staff.end_date, locale)}</p>
                  </div>
                )}
                {staff.email && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Email</p>
                    <p className="text-foreground font-medium truncate">{staff.email}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Inline leave form ─────────────────────────────────── */}
        <InlineLeaveForm staffId={staffId} open={showLeaveForm} onClose={() => setShowLeaveForm(false)} onCreated={() => {
          // Re-fetch profile to update leaves
          if (staffId) {
            setLoading(true)
            getStaffProfile(staffId, weekStart ?? undefined).then((d) => { setData(d); setLoading(false) })
          }
          // Refresh the week view so the leave shows on the calendar grid
          onRefreshWeek?.()
        }} />

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="border-t border-border px-5 py-4 shrink-0 flex items-center justify-between">
          <Button variant="outline" onClick={() => setShowLeaveForm(true)} className="gap-1.5 text-[14px] h-9">
            <CalendarPlus className="size-4" />
            {tl("addLeave")}
          </Button>
          <a href={`/staff/${staffId}`} className="text-[13px] text-primary hover:underline">{tStaff("profile")}</a>
        </div>
      </div>
    </>
  )
}
