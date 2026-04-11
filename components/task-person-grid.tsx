"use client"

import { useMemo, useState, useRef, useEffect, Fragment } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { AlertTriangle, CalendarDays, Plus, Users, X, Plane, Cross, User, GraduationCap, Baby, CalendarX } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { removeAssignment, upsertAssignment, type RotaWeekData, type RotaDay } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "@/components/calendar-panel/types"
import { ROLE_ORDER, DEFAULT_DEPT_MAPS } from "@/components/calendar-panel/constants"
import { TODAY } from "@/components/calendar-panel/constants"
import { DayStatsInput } from "@/components/calendar-panel/day-stats-input"

const LEAVE_ICON_MAP: Record<string, typeof Plane> = { annual: Plane, sick: Cross, personal: User, training: GraduationCap, maternity: Baby, other: CalendarX }
const LEAVE_LABEL: Record<string, { es: string; en: string }> = {
  annual:    { es: "Vacaciones", en: "Annual leave" },
  sick:      { es: "Baja médica", en: "Sick leave" },
  personal:  { es: "Personal",   en: "Personal" },
  training:  { es: "Formación",  en: "Training" },
  maternity: { es: "Maternidad", en: "Maternity" },
  other:     { es: "Ausencia",   en: "Leave" },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}
function resolveColor(color: string): string {
  if (!color) return "#94A3B8"
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}

/** Pill showing a task technique code — left border in technique color, cross-cell hover */
function TaskChip({
  label, tecColor, compact, colorChips, forceHover, onHover, onRemove,
}: {
  label: string; tecColor: string; compact?: boolean; colorChips?: boolean
  forceHover?: boolean; onHover?: (code: string | null) => void; onRemove?: () => void
}) {
  const [hov, setHov] = useState(false)
  const active = hov || forceHover
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded pl-1.5 pr-1 font-semibold group/chip transition-colors duration-100 text-foreground/70",
        compact ? "text-[10px] py-0" : "text-[11px] py-0.5",
      )}
      style={{
        borderRadius: 4,
        ...(colorChips && tecColor ? { borderLeft: `3px solid ${tecColor}` } : {}),
        ...(active && tecColor ? { backgroundColor: `${tecColor}40`, color: "var(--foreground)" } : {}),
      }}
      onMouseEnter={() => { setHov(true); onHover?.(label) }}
      onMouseLeave={() => { setHov(false); onHover?.(null) }}
    >
      {label}
      {/* Always render X to reserve space — invisible when not active to prevent layout shift */}
      {onRemove ? (
        <button
          className={cn("ml-0.5 leading-none opacity-70 hover:opacity-100 transition-opacity", !active && "invisible")}
          tabIndex={active ? 0 : -1}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >
          <X className="size-2.5" />
        </button>
      ) : null}
    </span>
  )
}

/** Portal-based task technique picker */
function TaskPickerPortal({ tecnicas, assigned, pos, onSelect, onClose }: {
  tecnicas: Tecnica[]; assigned: Set<string>
  pos: { top: number; left: number }; onSelect: (codigo: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])
  const available = tecnicas.filter((t) => t.activa && !assigned.has(t.codigo))
  if (available.length === 0) return null
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 200 }}
      className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-[200px] overflow-y-auto">
      {available.map((t) => (
        <button key={t.id}
          className="flex items-center gap-2 w-full px-2.5 py-1 text-[11px] hover:bg-muted text-left transition-colors"
          onClick={(e) => { e.stopPropagation(); onSelect(t.codigo); onClose() }}>
          <span className="size-2 rounded-full shrink-0 flex-none" style={{ background: resolveColor(t.color) }} />
          <span className="truncate">{t.nombre_es}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}

/** One staff × one day task cell — manages its own picker portal */
function TaskPersonCell({
  staffId, date, assignments, tecnicas, tecnicaByCode, colorChips, compact,
  isPublished, onLeave, leaveType, leaveShortText, locale, isLast, showOff,
  hoveredTecnica, highlightEnabled, onHoveredChange, onAdd, onRemove,
}: {
  staffId: string | null; date: string; assignments: Assignment[]
  tecnicas: Tecnica[]; tecnicaByCode: Record<string, Tecnica>
  colorChips?: boolean; compact?: boolean; isPublished: boolean
  onLeave?: boolean; leaveType?: string | null; leaveShortText: string
  locale?: string; isLast?: boolean; showOff?: boolean
  hoveredTecnica: string | null; highlightEnabled: boolean
  onHoveredChange: (code: string | null) => void
  onAdd: (staffId: string | null, date: string, codigo: string) => void
  onRemove: (assignmentId: string) => void
}) {
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null)
  const cellRef = useRef<HTMLDivElement>(null)
  const assignedCodes = useMemo(
    () => new Set(assignments.map((a) => a.function_label!).filter(Boolean)),
    [assignments]
  )

  function openPicker() {
    if (isPublished || onLeave) return
    const rect = cellRef.current?.getBoundingClientRect()
    if (rect) {
      const top = Math.min(rect.bottom + 4, window.innerHeight - 220)
      const left = Math.min(rect.left, window.innerWidth - 160)
      setPickerPos({ top, left })
    }
  }

  // Show OFF badge when staff has no assignments and is not on leave
  if (showOff && !onLeave && assignments.length === 0) {
    return (
      <div className={cn(
        "border-b border-r border-border flex items-center justify-center bg-background",
        compact ? "min-h-[22px] p-0.5" : "min-h-[28px] p-0.5",
        isLast && "border-r-0",
      )}>
        <span className={cn("text-muted-foreground/40 font-medium", compact ? "text-[9px]" : "text-[10px]")}>OFF</span>
      </div>
    )
  }

  // Leave cell — show leave type icon + label
  if (onLeave) {
    const LeaveIcon = LEAVE_ICON_MAP[leaveType ?? "other"] ?? LEAVE_ICON_MAP.other
    const leaveLabel = LEAVE_LABEL[leaveType ?? "other"]?.[locale === "en" ? "en" : "es"] ?? leaveShortText
    return (
      <div className={cn(
        "border-b border-r border-border flex items-center justify-center gap-0.5 bg-muted/20",
        compact ? "min-h-[22px] p-0.5" : "min-h-[28px] p-1",
        isLast && "border-r-0",
      )}>
        <LeaveIcon className={cn("shrink-0 text-amber-500", compact ? "size-2.5" : "size-3")} />
        <span className={cn("text-muted-foreground italic truncate", compact ? "text-[8px]" : "text-[9px]")}>{leaveLabel}</span>
      </div>
    )
  }

  return (
    <div
      ref={cellRef}
      className={cn(
        "border-b border-r border-border relative flex flex-wrap gap-0.5 items-center content-center group/cell bg-background",
        compact ? "min-h-[22px] p-0.5" : "min-h-[28px] p-0.5",
        isLast && "border-r-0",
      )}
    >
      {assignments.map((a) => {
        const tec = tecnicaByCode[a.function_label!]
        const tecColor = tec ? resolveColor(tec.color) : "#94A3B8"
        return (
          <TaskChip
            key={a.id}
            label={a.function_label!}
            tecColor={tecColor}
            compact={compact}
            colorChips={colorChips}
            forceHover={highlightEnabled && hoveredTecnica === a.function_label}
            onHover={onHoveredChange}
            onRemove={!isPublished ? () => onRemove(a.id) : undefined}
          />
        )
      })}
      {!isPublished && (
        <div
          onClick={openPicker}
          className="absolute top-0 right-0 bottom-0 w-4 flex items-center justify-center cursor-pointer opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-muted/40 rounded-r"
        >
          <Plus className="size-3 text-muted-foreground" />
        </div>
      )}
      {pickerPos && (
        <TaskPickerPortal
          tecnicas={tecnicas} assigned={assignedCodes} pos={pickerPos}
          onSelect={(c) => { onAdd(staffId, date, c); setPickerPos(null) }}
          onClose={() => setPickerPos(null)}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface TaskPersonGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  publicHolidays: Record<string, string>
  onLeaveByDate: Record<string, string[]>
  onLeaveTypeByDate?: Record<string, Record<string, string>>
  compact?: boolean
  colorChips?: boolean
  loading?: boolean
  simplified?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  biopsyConversionRate?: number
  biopsyDay5Pct?: number
  biopsyDay6Pct?: number
  onChipClick?: (staff_id: string) => void
  onDateClick?: (date: string) => void
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}


export function TaskPersonGrid({
  data, staffList, locale, isPublished, publicHolidays, onLeaveByDate, onLeaveTypeByDate,
  compact, colorChips = true, loading, simplified, punctionsDefault, punctionsOverride,
  onPunctionsChange, biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct,
  onChipClick, onDateClick, gridSetDaysRef,
}: TaskPersonGridProps) {
  const t = useTranslations("schedule")

  // Loading skeleton — staff-as-rows, days-as-columns
  if (loading) {
    const skelDays = 7
    const skelStaff = 8
    const skelCols = `80px repeat(${skelDays}, 1fr)`
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="rounded-lg border border-border overflow-hidden w-full">
          <div style={{ display: "grid", gridTemplateColumns: skelCols }}>
            {/* Header */}
            <div className="border-b border-r border-border bg-muted sticky left-0 z-20" style={{ minHeight: 48 }} />
            {Array.from({ length: skelDays }).map((_, i) => (
              <div key={i} className="border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 gap-1">
                <div className="shimmer-bar h-2 w-6" />
                <div className="shimmer-bar h-5 w-5 rounded-full" />
              </div>
            ))}
            {/* ALL row */}
            <div className="border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center px-2 py-1">
              <div className="shimmer-bar h-2.5 w-6" />
            </div>
            {Array.from({ length: skelDays }).map((_, i) => (
              <div key={i} className={cn("border-b border-r last:border-r-0 border-border flex flex-wrap gap-0.5 items-center content-center p-0.5", compact ? "min-h-[22px]" : "min-h-[28px]")}>
                <div className="shimmer-bar h-4 w-8 rounded" />
              </div>
            ))}
            {/* Staff rows */}
            {Array.from({ length: skelStaff }).map((_, row) => (
              <Fragment key={row}>
                <div className="border-b border-r border-border bg-muted sticky left-0 z-10 flex flex-col justify-center px-2 gap-1" style={{ minHeight: compact ? 28 : 34 }}>
                  <div className="shimmer-bar h-2.5 w-12" />
                </div>
                {Array.from({ length: skelDays }).map((_, col) => (
                  <div key={col} className={cn("border-b border-r last:border-r-0 border-border flex flex-wrap gap-0.5 items-center content-center p-0.5", compact ? "min-h-[22px]" : "min-h-[28px]")}>
                    <div className="shimmer-bar h-4 w-7 rounded" />
                    {col % 3 === 0 && <div className="shimmer-bar h-4 w-6 rounded" />}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredTecnica, setHoveredTecnica] = useState<string | null>(null)

  const [localDays, setLocalDays] = useState(data?.days ?? [])
  if (gridSetDaysRef) gridSetDaysRef.current = setLocalDays
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setLocalDays(data?.days ?? [])
  }

  const tecnicas = useMemo(() => (data?.tecnicas ?? []).filter((t) => t.activa).sort((a, b) => a.orden - b.orden), [data?.tecnicas])
  const tecnicaByCode = useMemo(() => Object.fromEntries(tecnicas.map((t) => [t.codigo, t])), [tecnicas])
  const defaultShiftCode = (data?.shiftTypes?.[0]?.code ?? "T1") as import("@/lib/types/database").ShiftType

  // Multi-assignment map: staffId → date → Assignment[]
  const taskAssignMap = useMemo(() => {
    const map: Record<string, Record<string, Assignment[]>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!map[a.staff_id]) map[a.staff_id] = {}
        if (!map[a.staff_id][day.date]) map[a.staff_id][day.date] = []
        map[a.staff_id][day.date].push(a)
      }
    }
    return map
  }, [localDays])

  // Whole-team by date — deduplicated by function_label per day
  const wholeTeamByDate = useMemo(() => {
    const map: Record<string, Assignment[]> = {}
    for (const day of localDays) {
      const seen = new Set<string>()
      map[day.date] = day.assignments.filter((a) => {
        if (!a.whole_team || !a.function_label) return false
        if (seen.has(a.function_label)) return false
        seen.add(a.function_label)
        return true
      })
    }
    return map
  }, [localDays])

  async function handleTaskRemove(assignmentId: string) {
    setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) })))
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
  }

  async function handleTaskAdd(staffId: string | null, date: string, tecnicaCodigo: string) {
    const tempId = `temp-${Date.now()}-${Math.random()}`
    const staffMember = staffId ? activeStaff.find((s) => s.id === staffId) : null
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId ?? "", shift_type: defaultShiftCode,
        is_manual_override: true, trainee_staff_id: null, notes: null,
        function_label: tecnicaCodigo, tecnica_id: null, whole_team: staffId === null,
        staff: staffMember
          ? { id: staffMember.id, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never }
          : { id: "", first_name: "All", last_name: "", role: "lab" as never },
      }],
    }))
    const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: staffId ?? "", date, shiftType: defaultShiftCode, functionLabel: tecnicaCodigo })
    if (result.error) toast.error(result.error)
    else {
      setLocalDays((prev) => prev.map((d) => ({
        ...d,
        assignments: d.assignments.map((a) => a.id === tempId ? { ...a, id: result.id ?? tempId } : a),
      })))
    }
  }

  const activeStaff = useMemo(() =>
    staffList
      .filter((s) => s.onboarding_status !== "inactive")
      .sort((a, b) => {
        const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
      })
  , [staffList])

  if (!data || localDays.length === 0) return null

  // Empty state — no rota or no assignments yet
  if (!data.rota || !localDays.some((d) => d.assignments.length > 0)) {
    return (
      <div className="flex-1 flex items-start justify-center pt-[18vh]">
        <div className="flex flex-col items-center gap-3 text-center">
          <CalendarDays className="size-10 text-muted-foreground/40" />
          <p className="text-[16px] font-medium text-muted-foreground">
            {locale === "es" ? "No hay horario para esta semana" : "No schedule for this week"}
          </p>
          <p className="text-[14px] text-muted-foreground/60">
            {locale === "es" ? "Genera un horario para ver las asignaciones de tareas" : "Generate a schedule to see task assignments"}
          </p>
        </div>
      </div>
    )
  }

  const gridCols = `80px repeat(${localDays.length}, 1fr)`

  // Shift times from data for corner display
  const shiftTimes = data.shiftTimes
  const shiftEntries = shiftTimes ? Object.entries(shiftTimes).slice(0, 3) : []

  // Punctions helpers
  const cr = biopsyConversionRate ?? 0.5
  const d5pct = biopsyDay5Pct ?? 0.5
  const d6pct = biopsyDay6Pct ?? 0.5

  function getDayStats(date: string) {
    const effectiveP = punctionsOverride?.[date] ?? punctionsDefault?.[date] ?? 0
    const defaultP = punctionsDefault?.[date] ?? 0
    const isOverride = punctionsOverride?.[date] !== undefined
    const d5ago = new Date(date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
    const d6ago = new Date(date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
    const d5str = d5ago.toISOString().split("T")[0]
    const d6str = d6ago.toISOString().split("T")[0]
    const p5 = punctionsOverride?.[d5str] ?? punctionsDefault?.[d5str] ?? 0
    const p6 = punctionsOverride?.[d6str] ?? punctionsDefault?.[d6str] ?? 0
    const bForecast = Math.round(p5 * cr * d5pct + p6 * cr * d6pct)
    return { effectiveP, defaultP, isOverride, bForecast }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden w-full">
      <div style={{ display: "grid", gridTemplateColumns: gridCols }}>

        {/* Top-left corner — shift time legend */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-20 flex flex-col items-start justify-center px-2 py-1 gap-0.5" style={{ minHeight: simplified === false ? 72 : 48 }}>
          {shiftEntries.map(([code, time]) => (
            <span key={code} className="text-[9px] text-muted-foreground/70 leading-tight tabular-nums">
              <span className="font-semibold" style={{ color: "var(--pref-bg, var(--primary))" }}>{code}</span>
              {" "}{time.start}–{time.end}
            </span>
          ))}
        </div>

        {/* Day column headers */}
        {localDays.map((day, dayIdx) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayN = String(d.getDate())
          const isToday = day.date === TODAY
          const holiday = publicHolidays[day.date]
          const isLast = dayIdx === localDays.length - 1
          const hasWarning = (day.skillGaps?.length ?? 0) > 0 || (day.warnings?.length ?? 0) > 0
          const stats = simplified === false ? getDayStats(day.date) : null
          return (
            <div key={day.date}
              className={cn(
                "border-b border-r border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1 cursor-pointer hover:bg-muted/80 transition-colors",
                holiday && "bg-amber-100/80 dark:bg-amber-900/20",
                isLast && "border-r-0",
              )}
              onClick={() => onDateClick?.(day.date)}
            >
              <div className="flex items-center gap-0.5">
                {hasWarning && <AlertTriangle className="size-2.5 text-amber-500 shrink-0" />}
                <span className={cn("uppercase text-muted-foreground", compact ? "text-[8px]" : "text-[9px]")}>{wday}</span>
              </div>
              <span className={cn(
                "font-semibold leading-none",
                isToday ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary"
              )}>{dayN}</span>
              {holiday && (
                <Tooltip>
                  <TooltipTrigger render={<span className="text-[8px] leading-none mt-0.5 cursor-default">🏖️</span>} />
                  <TooltipContent side="bottom">{holiday}</TooltipContent>
                </Tooltip>
              )}
              {stats && (
                <div onClick={(e) => e.stopPropagation()}>
                  <DayStatsInput
                    date={day.date}
                    value={stats.effectiveP}
                    defaultValue={stats.defaultP}
                    isOverride={stats.isOverride}
                    onChange={onPunctionsChange ?? (() => {})}
                    disabled={!onPunctionsChange}
                    biopsyForecast={stats.bForecast}
                    biopsyTooltip={locale === "es" ? `${stats.bForecast} biopsias previstas` : `${stats.bForecast} biopsy forecast`}
                    compact
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* ALL row — whole-team assignments */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center gap-1 px-2">
          <Users className={cn("shrink-0 text-muted-foreground/60", compact ? "size-2.5" : "size-3")} />
          <span className={cn("font-semibold text-muted-foreground", compact ? "text-[9px]" : "text-[10px]")}>ALL</span>
        </div>
        {localDays.map((day, dayIdx) => (
          <TaskPersonCell
            key={day.date}
            staffId={null}
            date={day.date}
            assignments={wholeTeamByDate[day.date] ?? []}
            tecnicas={data?.tecnicas ?? []}
            tecnicaByCode={tecnicaByCode}
            colorChips={colorChips}
            compact={compact}
            isPublished={isPublished}
            locale={locale}
            leaveShortText={t("leaveShort")}
            hoveredTecnica={hoveredTecnica}
            highlightEnabled={highlightEnabled}
            onHoveredChange={setHoveredTecnica}
            onAdd={handleTaskAdd}
            onRemove={handleTaskRemove}
            isLast={dayIdx === localDays.length - 1}
            showOff={false}
          />
        ))}

        {/* Staff rows: one row per person, day cells across */}
        {activeStaff.map((s) => {
          const roleColor = (colorChips && s.color) ? s.color : DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8"
          return (
            <Fragment key={s.id}>
              {/* Staff name — sticky left, bg-muted like the ALL row */}
              <div
                className={cn(
                  "border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center px-2 cursor-pointer hover:bg-muted/80 transition-colors",
                  compact ? "min-h-[28px] py-0.5" : "min-h-[34px] py-1",
                )}
                style={colorChips ? { borderLeft: `3px solid ${roleColor}` } : {}}
                onClick={() => onChipClick?.(s.id)}
              >
                <div className="min-w-0">
                  <p className={cn("font-medium leading-tight truncate text-foreground/80", compact ? "text-[9px]" : "text-[10px]")}>{s.first_name} {s.last_name[0]}.</p>
                </div>
              </div>
              {/* Day cells */}
              {localDays.map((day, dayIdx) => {
                const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)
                const leaveType = onLeave ? (onLeaveTypeByDate?.[day.date]?.[s.id] ?? null) : null
                const taskAssigns = (taskAssignMap[s.id]?.[day.date] ?? []).filter(
                  (a) => a.function_label && !a.function_label.startsWith("dept_") && !a.whole_team
                )
                return (
                  <TaskPersonCell
                    key={day.date}
                    staffId={s.id}
                    date={day.date}
                    assignments={taskAssigns}
                    tecnicas={data?.tecnicas ?? []}
                    tecnicaByCode={tecnicaByCode}
                    colorChips={colorChips}
                    compact={compact}
                    isPublished={isPublished}
                    onLeave={onLeave}
                    leaveType={leaveType}
                    locale={locale}
                    leaveShortText={t("leaveShort")}
                    isLast={dayIdx === localDays.length - 1}
                    hoveredTecnica={hoveredTecnica}
                    highlightEnabled={highlightEnabled}
                    onHoveredChange={setHoveredTecnica}
                    onAdd={handleTaskAdd}
                    onRemove={handleTaskRemove}
                    showOff
                  />
                )
              })}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
