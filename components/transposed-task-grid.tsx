"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase, CalendarDays, Plus, X, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useStaffHover } from "@/components/staff-hover-context"
import { toast } from "sonner"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import { upsertAssignment, removeAssignment, setWholeTeam } from "@/app/(clinic)/rota/actions"
import { DayStatsInput } from "@/components/calendar-panel/day-stats-input"

const COLOR_HEX: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}
function resolveColor(color: string): string {
  if (!color) return "#94A3B8"
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}
const ROLE_BORDER: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }
function resolveStaffColor(color: string): string {
  if (!color) return "#94A3B8"
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}

// ── Staff selector popup ──────────────────────────────────────────────────────

function StaffSelectorPopup({
  onClose, tecnica, staffList, assignedStaffIds, leaveIds, isWholeTeam,
  colorChips, staffColorMap, onAdd, onRemove, onToggleWholeTeam,
}: {
  onClose: () => void; tecnica: Tecnica; staffList: StaffWithSkills[]
  assignedStaffIds: Set<string>; leaveIds: Set<string>; isWholeTeam: boolean
  colorChips: boolean; staffColorMap: Record<string, string>
  onAdd: (staffId: string) => void; onRemove: (staffId: string) => void
  onToggleWholeTeam: () => void
}) {
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [onClose])

  const tecCode = tecnica.codigo.toUpperCase()
  const qualified = staffList.filter((s) => s.staff_skills?.some((sk) => sk.skill.toUpperCase() === tecCode) && s.onboarding_status !== "inactive")
  const filtered = qualified
    .filter((s) => {
      if (!search) return true
      const name = `${s.first_name} ${s.last_name}`.toLowerCase()
      return name.includes(search.toLowerCase()) || `${s.first_name[0]}${s.last_name[0]}`.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name))

  return (
    <div ref={ref} className="bg-background border border-border rounded-lg shadow-lg w-56 overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="p-2 border-b border-border">
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..."
          className="w-full text-[12px] px-2 py-1 border border-input rounded outline-none focus:border-primary bg-background" />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {/* Whole team toggle */}
        <button onClick={onToggleWholeTeam}
          className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors",
            isWholeTeam ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50")}>
          <Users className="size-3.5 shrink-0" />
          <span className="flex-1">Todo el equipo</span>
          {isWholeTeam && <span className="text-[10px]">✓</span>}
        </button>
        <div className="h-px bg-border" />
        {filtered.length === 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">Sin personal cualificado</p>}
        {filtered.map((s) => {
          const isSelected = assignedStaffIds.has(s.id)
          const onLeave = leaveIds.has(s.id)
          return (
            <button key={s.id} disabled={onLeave}
              onClick={() => { if (!onLeave) isSelected ? onRemove(s.id) : onAdd(s.id) }}
              className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors",
                onLeave ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/50")}>
              <span className={cn("size-4 rounded border flex items-center justify-center text-[9px] shrink-0",
                isSelected ? "bg-primary border-primary text-primary-foreground" :
                onLeave ? "border-red-300 bg-red-100" : "border-border bg-background")}>
                {(isSelected || onLeave) && "✓"}
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground w-5 shrink-0">{s.first_name[0]}{s.last_name[0]}</span>
              <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
              {onLeave && <span className="text-[9px] text-red-500 shrink-0">Baja</span>}
              {isSelected && !onLeave && <span className="text-[9px] text-muted-foreground shrink-0">Asignado</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Tecnica×day cell ──────────────────────────────────────────────────────────

type AssignmentLike = {
  id: string; staff_id: string; function_label: string | null; tecnica_id: string | null
  staff: { first_name: string; last_name: string }; whole_team: boolean; shift_type: string
}

function TechDayCell({
  tec, dayDate, assignments, staffList, leaveIds, isPublished, colorChips, staffColorMap,
  compact, isWeekend, isSat, hoveredStaffId, setHovered,
  onAdd, onRemoveById, onToggleWholeTeam, onChipClick,
}: {
  tec: Tecnica; dayDate: string
  assignments: AssignmentLike[]
  staffList: StaffWithSkills[]; leaveIds: Set<string>
  isPublished: boolean; colorChips: boolean; staffColorMap: Record<string, string>
  compact: boolean; isWeekend: boolean; isSat: boolean
  hoveredStaffId: string | null; setHovered: (id: string | null) => void
  onAdd: (staffId: string, date: string, tecnicaCodigo: string) => void
  onRemoveById: (assignmentId: string) => void
  onToggleWholeTeam: (date: string, tecnicaCodigo: string, isCurrentlyWholeTeam: boolean) => void
  onChipClick?: (staffId: string) => void
}) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const cellRef = useRef<HTMLDivElement>(null)

  const isWholeTeam = assignments.some((a) => a.whole_team)
  // Show ALL individual staff regardless of whole_team flag (setWholeTeam marks all rows whole_team=true)
  const individualAssignments = assignments.filter((a) => a.staff_id)
  const assignedStaffIds = new Set(assignments.map((a) => a.staff_id).filter(Boolean))

  function openSelector() {
    if (isPublished) return
    const rect = cellRef.current?.getBoundingClientRect()
    if (rect) {
      const top = Math.min(rect.bottom + 4, window.innerHeight - 260)
      const left = Math.min(rect.left, window.innerWidth - 232)
      setPopupPos({ top, left })
    }
    setSelectorOpen(true)
  }

  return (
    <div
      ref={cellRef}
      className={cn(
        "border-b border-r border-border relative flex flex-wrap gap-0.5 items-start content-start group/cell",
        isWeekend && "bg-muted/30",
        compact ? "min-h-[22px] p-0.5" : "min-h-[32px] p-0.5 pb-5",
      )}
    >
      {individualAssignments.map((a) => {
        const sColor = staffColorMap[a.staff_id]
        const isHov = hoveredStaffId === a.staff_id
        return (
          <Tooltip key={a.id}>
            <TooltipTrigger render={
              <span
                className={cn("inline-flex items-center gap-0.5 rounded pl-1.5 pr-1 font-semibold group/chip transition-colors duration-100 text-foreground/70",
                  compact ? "text-[10px] py-0" : "text-[11px] py-0.5", onChipClick && "cursor-pointer")}
                style={{
                  borderRadius: 4,
                  ...(colorChips && sColor ? { borderLeft: `3px solid ${sColor}` } : {}),
                  ...(isHov && sColor ? { backgroundColor: `${sColor}80`, color: "#1e293b" } : {}),
                }}
                onMouseEnter={() => setHovered(a.staff_id)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); onChipClick?.(a.staff_id) }}
              >
                {a.staff.first_name[0]}{a.staff.last_name[0]}
                {!isPublished && (
                  <button onClick={(e) => { e.stopPropagation(); onRemoveById(a.id) }}
                    className="opacity-0 group-hover/chip:opacity-100 hover:text-destructive transition-opacity ml-0.5">
                    <X className="size-2.5" />
                  </button>
                )}
              </span>
            } />
            <TooltipContent side="top">{a.staff.first_name} {a.staff.last_name} · {tec.nombre_es}</TooltipContent>
          </Tooltip>
        )
      })}
      {isWholeTeam && (
        <span
          className={cn("inline-flex items-center gap-0.5 rounded pl-1 pr-0.5 font-semibold group/chip transition-colors duration-100 bg-primary/10 text-primary", compact ? "text-[10px] py-0" : "text-[11px] py-0.5")}
        >
          <Users className="size-2.5" />
          All
          {!isPublished && (
            <button onClick={(e) => { e.stopPropagation(); onToggleWholeTeam(dayDate, tec.codigo, true) }}
              className="opacity-0 group-hover/chip:opacity-100 hover:text-destructive transition-opacity ml-0.5">
              <X className="size-2.5" />
            </button>
          )}
        </span>
      )}
      {!isPublished && (
        <div onClick={openSelector}
          className="absolute bottom-0 left-0 right-0 h-5 flex items-center justify-center cursor-pointer opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-muted/40 rounded-b">
          <Plus className="size-3 text-muted-foreground" />
        </div>
      )}
      {selectorOpen && popupPos && createPortal(
        <div style={{ position: "fixed", top: popupPos.top, left: popupPos.left, zIndex: 200 }}>
          <StaffSelectorPopup
            onClose={() => { setSelectorOpen(false); setPopupPos(null) }}
            tecnica={tec} staffList={staffList} assignedStaffIds={assignedStaffIds}
            leaveIds={leaveIds} isWholeTeam={isWholeTeam}
            colorChips={colorChips} staffColorMap={staffColorMap}
            onAdd={(staffId) => { onAdd(staffId, dayDate, tec.codigo); setSelectorOpen(false); setPopupPos(null) }}
            onRemove={(staffId) => {
              const a = assignments.find((x) => x.staff_id === staffId)
              if (a) onRemoveById(a.id)
            }}
            onToggleWholeTeam={() => onToggleWholeTeam(dayDate, tec.codigo, isWholeTeam)}
          />
        </div>, document.body
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface TransposedTaskGridProps {
  data: RotaWeekData | null; staffList: StaffWithSkills[]; locale: string
  isPublished: boolean; publicHolidays: Record<string, string>; onLeaveByDate: Record<string, string[]>
  compact?: boolean; colorChips?: boolean; loading?: boolean; simplified?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  biopsyConversionRate?: number; biopsyDay5Pct?: number; biopsyDay6Pct?: number
  onRemoveAssignment?: (id: string) => void
  onCellClick?: (date: string, tecnicaCode: string) => void
  onChipClick?: (staff_id: string) => void; onDateClick?: (date: string) => void
}

export function TransposedTaskGrid({
  data, staffList, locale, isPublished, publicHolidays, onLeaveByDate, compact = false,
  colorChips = true, loading, simplified, punctionsDefault, punctionsOverride, onPunctionsChange,
  biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct,
  onRemoveAssignment, onChipClick, onDateClick,
}: TransposedTaskGridProps) {
  const t = useTranslations("schedule")
  // Subscribe to staff hover context at parent level — ensures all TechDayCell props update on hover
  const { hoveredStaffId, setHovered } = useStaffHover()

  if (loading) {
    const skelTecnicas = 5
    const skelGridCols = `75px repeat(${skelTecnicas}, minmax(62px, 88px)) minmax(130px, 1fr)`
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="overflow-auto flex-1 rounded-lg border border-border">
          <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: skelGridCols }}>
            <div className="sticky top-0 z-10 border-b border-r border-border bg-muted h-[48px]" />
            {Array.from({ length: skelTecnicas }).map((_, i) => (
              <div key={i} className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2 flex flex-col items-center gap-1">
                <div className="shimmer-bar h-3 w-10 rounded" />
                <div className="shimmer-bar h-2 w-16 rounded" />
              </div>
            ))}
            <div className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 flex items-center justify-center">
              <div className="shimmer-bar h-3 w-8" />
            </div>
            {Array.from({ length: 7 }).map((_, row) => (
              <>
                <div key={`h-${row}`} className="border-b border-r border-border bg-muted px-2 py-1.5 flex items-center justify-end gap-1.5 sticky left-0 z-10">
                  <div className="shimmer-bar h-2.5 w-6" />
                  <div className="shimmer-bar w-5 h-5 rounded-full" />
                </div>
                {Array.from({ length: skelTecnicas }).map((_, col) => (
                  <div key={col} className="border-b border-r border-border px-1 py-1 min-h-[28px]">
                    <div className="shimmer-bar h-4 w-8 rounded" />
                  </div>
                ))}
                <div key={`off-${row}`} className="border-b border-border p-1 min-h-[28px]">
                  <div className="shimmer-bar h-4 w-full rounded" />
                </div>
              </>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const tecnicas = useMemo(() => (data?.tecnicas ?? []).filter((t) => t.activa).sort((a, b) => a.orden - b.orden), [data?.tecnicas])
  const today = new Date().toISOString().split("T")[0]
  const visibleStaffIds = useMemo(() => new Set(staffList.map((s) => s.id)), [staffList])
  const staffColorMap = useMemo(() =>
    Object.fromEntries(staffList.map((s) => [s.id, s.color ? resolveStaffColor(s.color) : (ROLE_BORDER[s.role] ?? "#64748B")]))
  , [staffList])

  const [localDays, setLocalDays] = useState<RotaDay[]>(data?.days ?? [])
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) { setPrevData(data); setLocalDays(data?.days ?? []) }

  // P/B stats helpers (same logic as TaskPersonGrid)
  const cr = biopsyConversionRate ?? 0.5
  const d5pct = biopsyDay5Pct ?? 0.5
  const d6pct = biopsyDay6Pct ?? 0.5
  function getDayStats(date: string) {
    const effectiveP = punctionsOverride?.[date] ?? punctionsDefault?.[date] ?? 0
    const defaultP = punctionsDefault?.[date] ?? 0
    const isOverride = punctionsOverride?.[date] !== undefined
    const d5ago = new Date(date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
    const d6ago = new Date(date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
    const p5 = punctionsOverride?.[d5ago.toISOString().split("T")[0]] ?? punctionsDefault?.[d5ago.toISOString().split("T")[0]] ?? 0
    const p6 = punctionsOverride?.[d6ago.toISOString().split("T")[0]] ?? punctionsDefault?.[d6ago.toISOString().split("T")[0]] ?? 0
    const bForecast = Math.round(p5 * cr * d5pct + p6 * cr * d6pct)
    return { effectiveP, defaultP, isOverride, bForecast }
  }

  async function handleAdd(staffId: string, date: string, tecnicaCodigo: string) {
    const defaultShiftCode = (data?.shiftTypes?.[0]?.code ?? "T1") as import("@/lib/types/database").ShiftType
    const tempId = `temp-${Date.now()}-${Math.random()}`
    const staffMember = staffList.find((s) => s.id === staffId)
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId, shift_type: defaultShiftCode, is_manual_override: true,
        trainee_staff_id: null, notes: null, function_label: tecnicaCodigo, tecnica_id: null, whole_team: false,
        staff: staffMember
          ? { id: staffMember.id, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never }
          : { id: staffId, first_name: "?", last_name: "", role: "lab" as never },
      }],
    }))
    const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId, date, shiftType: defaultShiftCode, functionLabel: tecnicaCodigo })
    if (result.error) {
      toast.error(result.error)
      setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== tempId) })))
    } else {
      setLocalDays((prev) => prev.map((d) => ({
        ...d, assignments: d.assignments.map((a) => a.id === tempId ? { ...a, id: result.id ?? tempId } : a),
      })))
    }
  }

  async function handleRemove(assignmentId: string) {
    setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) })))
    onRemoveAssignment?.(assignmentId)
  }

  async function handleToggleWholeTeam(date: string, tecnicaCodigo: string, isCurrentlyWholeTeam: boolean) {
    const newState = !isCurrentlyWholeTeam
    // Optimistic update
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: newState
        ? d.assignments.map((a) => a.function_label === tecnicaCodigo ? { ...a, whole_team: true } : a)
        : d.assignments.map((a) => a.function_label === tecnicaCodigo ? { ...a, whole_team: false } : a),
    }))
    const result = await setWholeTeam(data?.weekStart ?? "", tecnicaCodigo, date, newState)
    if (result.error) toast.error(result.error)
  }

  // Empty state — no rota generated yet
  if (!data || localDays.length === 0 || !data.rota || !localDays.some((d) => d.assignments.length > 0)) {
    return (
      <div className="flex-1 flex items-start justify-center pt-[18vh]">
        <div className="flex flex-col items-center gap-3 text-center">
          <CalendarDays className="size-10 text-muted-foreground/40" />
          <p className="text-[16px] font-medium text-muted-foreground">
            {t("noRota")}
          </p>
          <p className="text-[14px] text-muted-foreground/60">
            {t("generateToSeeAssignments")}
          </p>
        </div>
      </div>
    )
  }

  if (tecnicas.length === 0) return null

  // Narrow technique columns (space for ~2 badges), wider OFF column
  const gridCols = `75px repeat(${tecnicas.length}, minmax(62px, 88px)) minmax(130px, 1fr)`

  return (
    <div className="overflow-auto flex-1 rounded-lg border border-border">
      <div style={{ display: "grid", gridTemplateColumns: gridCols }}>

        {/* Header: corner + technique columns (colored bottom border) + OFF */}
        <div className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2" />
        {tecnicas.map((tec) => {
          const dotColor = resolveColor(tec.color)
          return (
            <div key={tec.id} className="sticky top-0 z-10 border-r border-border bg-muted px-1 py-1.5 text-center"
              style={{ borderBottom: `3px solid ${dotColor}` }}>
              <span className={cn("font-semibold text-foreground block", compact ? "text-[9px]" : "text-[10px]")}>{tec.codigo}</span>
              <p className={cn("text-muted-foreground truncate mt-0.5", compact ? "text-[7px]" : "text-[8px]")}>{tec.nombre_es}</p>
            </div>
          )
        })}
        <div className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-center">
          <p className={cn("font-semibold text-muted-foreground", compact ? "text-[9px]" : "text-[11px]")}>OFF</p>
        </div>

        {/* Day rows */}
        {localDays.map((day) => {
          const dow = new Date(day.date + "T12:00:00").getDay()
          const dayNum = new Date(day.date + "T12:00:00").getDate()
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(day.date + "T12:00:00"))
          const isToday = day.date === today
          const isSat = dow === 6
          const isWeekend = dow === 0 || dow === 6
          const holiday = publicHolidays[day.date]
          const leaveIds = new Set(onLeaveByDate[day.date] ?? [])
          const hasWarnings = day.warnings.length > 0
          const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
          const offStaff = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id) && visibleStaffIds.has(s.id) && s.onboarding_status !== "inactive")

          return (
            <>
              {/* Row label */}
              {(() => {
                const stats = simplified === false ? getDayStats(day.date) : null
                return (
                  <div key={`header-${day.date}`} onClick={() => onDateClick?.(day.date)}
                    className={cn("border-b border-r border-border px-1.5 py-1.5 flex flex-col items-end justify-center gap-0.5 bg-muted sticky left-0 z-10",
                      onDateClick && "cursor-pointer hover:bg-muted/80", holiday && "bg-amber-50/60")}
                  >
                    <div className="flex items-center gap-1">
                      {hasWarnings && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                      <span className="text-[10px] text-muted-foreground uppercase">{wday}</span>
                      <span className={cn("font-semibold leading-none",
                        isToday ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary")}>
                        {dayNum}
                      </span>
                      {holiday && (
                        <Tooltip>
                          <TooltipTrigger render={<span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>} />
                          <TooltipContent side="right">{holiday}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
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
                          biopsyTooltip={t("biopsyForecastTooltip", { count: stats.bForecast })}
                          compact
                        />
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Technique cells */}
              {tecnicas.map((tec) => {
                const cellAssignments = day.assignments.filter(
                  (a) => (a.function_label === tec.codigo || a.tecnica_id === tec.id) && visibleStaffIds.has(a.staff_id)
                )
                return (
                  <TechDayCell
                    key={`${day.date}-${tec.codigo}`}
                    tec={tec} dayDate={day.date} assignments={cellAssignments}
                    staffList={staffList} leaveIds={leaveIds}
                    isPublished={isPublished} colorChips={colorChips} staffColorMap={staffColorMap}
                    compact={compact} isWeekend={isWeekend} isSat={isSat}
                    hoveredStaffId={hoveredStaffId} setHovered={setHovered}
                    onAdd={handleAdd} onRemoveById={handleRemove}
                    onToggleWholeTeam={handleToggleWholeTeam} onChipClick={onChipClick}
                  />
                )
              })}

              {/* OFF column — inline initials badges */}
              <div key={`off-${day.date}`}
                className="border-b border-border p-1 flex flex-wrap gap-0.5 content-start items-start"
                style={{ backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px", backgroundPosition: "2px 2px", backgroundClip: "padding-box" }}>
                {[...leaveIds].map((sid) => {
                  const s = staffList.find((st) => st.id === sid)
                  if (!s) return null
                  return (
                    <Tooltip key={sid}>
                      <TooltipTrigger render={
                        <span className={cn("inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1 font-medium text-amber-700", compact ? "text-[9px] py-0" : "text-[10px] py-0.5")}>
                          <Briefcase className="size-2.5 text-amber-500 shrink-0" />
                          {s.first_name[0]}{s.last_name[0]}
                        </span>
                      } />
                      <TooltipContent side="top">{s.first_name} {s.last_name}</TooltipContent>
                    </Tooltip>
                  )
                })}
                {offStaff.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  const sColor = staffColorMap[s.id]
                  return (
                    <Tooltip key={s.id}>
                      <TooltipTrigger render={
                        <span
                          className={cn("inline-flex items-center rounded border border-border/50 bg-background font-medium text-muted-foreground transition-colors duration-100 cursor-default", compact ? "text-[9px] px-1 py-0" : "text-[10px] px-1 py-0.5")}
                          onMouseEnter={() => setHovered(s.id)}
                          onMouseLeave={() => setHovered(null)}
                          style={isHov && sColor ? { backgroundColor: `${sColor}70`, color: "#1e293b", borderColor: `${sColor}99` } : undefined}
                        >
                          {s.first_name[0]}{s.last_name[0]}
                        </span>
                      } />
                      <TooltipContent side="top">{s.first_name} {s.last_name}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </>
          )
        })}
      </div>
    </div>
  )
}
