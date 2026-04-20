"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Search, Palmtree } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate, toISODate } from "@/lib/format-date"
import { formatTime } from "@/lib/format-time"
import type { RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"

interface MobilePersonViewProps {
  days: RotaDay[]
  staffList: StaffWithSkills[]
  onLeaveByDate: Record<string, string[]>
  shiftTimes: ShiftTimes | null
  tecnicas: Tecnica[]
  locale: "es" | "en"
  timeFormat?: string
}

export function MobilePersonView({
  days, staffList, onLeaveByDate, shiftTimes, tecnicas, locale, timeFormat,
}: MobilePersonViewProps) {
  const t = useTranslations("schedule")
  const tSwaps = useTranslations("swaps")
  const [search, setSearch] = useState("")
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  // Filter active staff
  const activeStaff = staffList.filter((s) => s.onboarding_status !== "inactive")
  const filteredStaff = search
    ? activeStaff.filter((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()))
    : activeStaff

  const selectedStaff = selectedStaffId ? activeStaff.find((s) => s.id === selectedStaffId) : null

  return (
    <div className="flex flex-col gap-3">
      {/* Staff picker */}
      {!selectedStaff ? (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPerson")}
              className="w-full pl-8 pr-3 h-9 rounded-lg border border-input bg-transparent text-[13px] outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            {filteredStaff.map((s) => {
              // Count assignments this week
              const weekCount = days.reduce((n, d) => n + d.assignments.filter((a) => a.staff_id === s.id).length, 0)
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStaffId(s.id); setSearch("") }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left active:bg-accent hover:bg-muted/50 transition-colors"
                >
                  <span
                    className="size-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: s.role === "lab" ? "#3B82F6" : s.role === "andrology" ? "#10B981" : "#64748B" }}
                  >
                    {s.first_name[0]}{s.last_name[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate">{s.first_name} {s.last_name}</p>
                    <p className="text-[11px] text-muted-foreground">{weekCount}/{s.days_per_week} {t("shifts")}</p>
                  </div>
                </button>
              )
            })}
            {filteredStaff.length === 0 && (
              <p className="text-[13px] text-muted-foreground italic text-center py-4">
                {t("noResults")}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Selected person header */}
          <div className="flex items-center gap-3">
            <span
              className="size-9 rounded-full flex items-center justify-center text-[12px] font-semibold text-white shrink-0"
              style={{ backgroundColor: selectedStaff.role === "lab" ? "#3B82F6" : selectedStaff.role === "andrology" ? "#10B981" : "#64748B" }}
            >
              {selectedStaff.first_name[0]}{selectedStaff.last_name[0]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium">{selectedStaff.first_name} {selectedStaff.last_name}</p>
              <p className="text-[11px] text-muted-foreground">{selectedStaff.days_per_week}d/{t("weekAbbr")}</p>
            </div>
            <button
              onClick={() => setSelectedStaffId(null)}
              className="text-[12px] text-primary hover:underline shrink-0"
            >
              {t("change")}
            </button>
          </div>

          {/* Week schedule for this person */}
          <div className="flex flex-col gap-1">
            {days.map((day) => {
              const myAssignments = day.assignments.filter((a) => a.staff_id === selectedStaffId)
              const isOnLeave = onLeaveByDate[day.date]?.includes(selectedStaffId!) ?? false
              const isToday = day.date === toISODate()

              return (
                <div
                  key={day.date}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg border",
                    isToday ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                  )}
                >
                  {/* Day label */}
                  <div className="w-16 shrink-0">
                    <p className={cn("text-[12px] font-medium", isToday && "text-primary")}>
                      {formatDate(day.date, locale).split(" ").slice(0, 2).join(" ")}
                    </p>
                  </div>

                  {/* Content */}
                  {isOnLeave ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <Palmtree className="size-3.5 text-amber-500" />
                      <span className="text-[13px] text-amber-600">{t("leaveLabel")}</span>
                    </div>
                  ) : myAssignments.length > 0 ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* Shift badge */}
                      <span className="text-[11px] font-semibold bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {myAssignments[0].shift_type}
                      </span>
                      {/* Time */}
                      {shiftTimes?.[myAssignments[0].shift_type] && (
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {formatTime(shiftTimes[myAssignments[0].shift_type].start, timeFormat)}–{formatTime(shiftTimes[myAssignments[0].shift_type].end, timeFormat)}
                        </span>
                      )}
                      {/* Tasks */}
                      {myAssignments.some((a) => a.function_label) && (
                        <div className="flex items-center gap-1 ml-auto overflow-hidden">
                          {myAssignments.filter((a) => a.function_label).map((a) => {
                            const tec = tecnicas.find((t) => t.codigo === a.function_label)
                            return (
                              <span key={a.id} className="text-[10px] px-1 py-0.5 rounded border border-primary/20 text-primary font-medium truncate">
                                {tec?.nombre_es ?? a.function_label}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : day.assignments.length > 0 ? (
                    <span className="text-[13px] text-muted-foreground">{tSwaps("off")}</span>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/40 italic">{t("noRota")}</span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
