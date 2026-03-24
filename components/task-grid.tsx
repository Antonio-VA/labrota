"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { X, Plus, Users, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { StaffWithSkills, Tecnica, ShiftType } from "@/lib/types/database"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import { upsertAssignment, removeAssignment, setWholeTeam } from "@/app/(clinic)/rota/actions"

const COLOR_HEX: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}
function resolveColor(color: string): string {
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string
  staff_id: string
  date: string
  shift_type: string
  function_label: string | null
  tecnica_id: string | null
  whole_team: boolean
  is_manual_override: boolean
  staff: { id: string; first_name: string; last_name: string; role: string }
}

// ── Staff selector popover ────────────────────────────────────────────────────

interface SelectorResult {
  staffIds: string[]
  wholeTeam: boolean
}

function StaffSelector({
  open,
  onClose,
  tecnica,
  availableStaff,
  assignedStaffIds,
  leaveStaffIds,
  isWholeTeam,
  allowWholeTeam,
}: {
  open: boolean
  onClose: (result: SelectorResult | null) => void
  tecnica: Tecnica
  availableStaff: StaffWithSkills[]
  assignedStaffIds: Set<string>
  leaveStaffIds: Set<string>
  isWholeTeam: boolean
  allowWholeTeam: boolean
}) {
  const [search, setSearch] = useState("")
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(assignedStaffIds))
  const [localWholeTeam, setLocalWholeTeam] = useState(isWholeTeam)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  if (!open) return null

  // Only show staff with the skill for this technique
  const qualifiedStaff = availableStaff.filter((s) =>
    s.staff_skills.some((sk) => sk.skill === tecnica.codigo)
  )

  const filtered = qualifiedStaff.filter((s) => {
    if (!search) return true
    const name = `${s.first_name} ${s.last_name}`.toLowerCase()
    const initials = `${s.first_name[0]}${s.last_name[0]}`.toLowerCase()
    return name.includes(search.toLowerCase()) || initials.includes(search.toLowerCase())
  })

  const selectedCount = localSelected.size
  const atCap = selectedCount >= 3

  function toggle(id: string) {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 3) next.add(id)
      return next
    })
  }

  return (
    <div
      ref={ref}
      className="bg-background border border-border rounded-lg shadow-lg w-56 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-border">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="w-full text-[12px] px-2 py-1 border border-input rounded outline-none focus:border-primary bg-background"
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {allowWholeTeam && (
          <button
            onClick={() => setLocalWholeTeam(!localWholeTeam)}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors",
              localWholeTeam ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
            )}
          >
            <Users className="size-3.5" />
            <span className="flex-1">Todo el equipo</span>
            {localWholeTeam && <span className="text-[10px]">✓</span>}
          </button>
        )}
        {allowWholeTeam && <div className="h-px bg-border" />}

        {filtered.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">Sin personal</p>
        )}
        {filtered.map((s) => {
          const isSelected = localSelected.has(s.id)
          const onLeave = leaveStaffIds.has(s.id)
          const disabled = (atCap && !isSelected) || onLeave

          return (
            <button
              key={s.id}
              onClick={() => { if (!disabled) toggle(s.id) }}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors",
                isSelected ? "bg-primary/10 text-primary font-medium" : disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/50"
              )}
            >
              <span className="size-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold shrink-0">
                {`${s.first_name[0]}${s.last_name[0]}`}
              </span>
              <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
              {onLeave && <span className="text-[9px] text-amber-500">Baja</span>}
              {isSelected && <span className="text-[10px]">✓</span>}
            </button>
          )
        })}
      </div>
      <div className="p-2 border-t border-border">
        <Button size="sm" className="w-full text-[11px]" onClick={() => onClose({ staffIds: [...localSelected], wholeTeam: localWholeTeam })}>Confirmar</Button>
      </div>
    </div>
  )
}

// ── Task swimlane cell ────────────────────────────────────────────────────────

function TaskCell({
  tecnica,
  date,
  assignments,
  staffList,
  leaveStaffIds,
  conflictStaffIds,
  isPublished,
  onAssign,
  onRemove,
  onToggleWholeTeam,
}: {
  tecnica: Tecnica
  date: string
  assignments: Assignment[]
  staffList: StaffWithSkills[]
  leaveStaffIds: Set<string>
  conflictStaffIds: Set<string>
  isPublished: boolean
  onAssign: (staffId: string, tecnicaCodigo: string, date: string) => void
  onRemove: (assignmentId: string) => void
  onToggleWholeTeam: (tecnicaCodigo: string, date: string, current: boolean) => void
}) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const cellRef = useRef<HTMLDivElement>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const isWholeTeam = assignments.some((a) => a.whole_team)
  const assignedStaffIds = new Set(assignments.map((a) => a.staff_id))

  function openSelector() {
    if (isPublished) return
    const rect = cellRef.current?.getBoundingClientRect()
    if (rect) setPopupPos({ top: rect.bottom + 4, left: rect.left })
    setSelectorOpen(true)
  }

  return (
    <div ref={cellRef} className="relative p-1 min-h-[36px] flex items-center gap-0.5 flex-wrap">
      {isWholeTeam && (
        <Tooltip>
          <TooltipTrigger render={
            <button
              onClick={() => openSelector()}
              className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold"
            >
              <Users className="size-2.5" />
              All
            </button>
          } />
          <TooltipContent side="top">Todo el equipo</TooltipContent>
        </Tooltip>
      )}
      {assignments.map((a) => {
        const onLeave = leaveStaffIds.has(a.staff_id)
        const hasConflict = conflictStaffIds.has(a.staff_id)
        return (
          <Tooltip key={a.id}>
            <TooltipTrigger render={
              <span className={cn(
                "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold group/chip",
                onLeave ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                hasConflict ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
              )}>
                {`${a.staff.first_name[0]}${a.staff.last_name[0]}`}
                {!isPublished && (
                  <button onClick={(e) => { e.stopPropagation(); onRemove(a.id) }} className="opacity-0 group-hover/chip:opacity-100 hover:text-destructive transition-opacity">
                    <X className="size-2.5" />
                  </button>
                )}
              </span>
            } />
            <TooltipContent side="top">
              {a.staff.first_name} {a.staff.last_name}
              {onLeave && " · De baja hoy"}
              {hasConflict && ` · Asignado a múltiples técnicas`}
            </TooltipContent>
          </Tooltip>
        )
      })}
      {!isPublished && (
        <button
          onClick={() => openSelector()}
          className="size-5 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          <Plus className="size-3" />
        </button>
      )}

      {selectorOpen && popupPos && createPortal(
        <div style={{ position: "fixed", top: popupPos.top, left: popupPos.left, zIndex: 200 }}>
          <StaffSelector
            open={selectorOpen}
            onClose={async (result) => {
              setSelectorOpen(false)
              setPopupPos(null)
              if (!result) return
              const { staffIds: selected, wholeTeam } = result

              // Handle whole_team toggle
              if (wholeTeam !== isWholeTeam) {
                onToggleWholeTeam(tecnica.codigo, date, isWholeTeam)
              }

              // Compute diff: add new, remove deselected
              const toAdd = selected.filter((id) => !assignedStaffIds.has(id))
              const toRemove = [...assignedStaffIds].filter((id) => !selected.includes(id))
              for (const id of toRemove) {
                const a = assignments.find((x) => x.staff_id === id)
                if (a) await onRemove(a.id)
              }
              for (const id of toAdd) {
                await onAssign(id, tecnica.codigo, date)
              }
            }}
            tecnica={tecnica}
            availableStaff={staffList}
            assignedStaffIds={assignedStaffIds}
            leaveStaffIds={leaveStaffIds}
            isWholeTeam={isWholeTeam}
            allowWholeTeam={true}
          />
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Main grid ─────────────────────────────────────────────────────────────────

export function TaskGrid({
  data,
  staffList,
  loading,
  locale,
  isPublished,
  onRefresh,
  taskConflictThreshold,
  punctionsDefault = {},
  punctionsOverride = {},
  onPunctionsChange,
  biopsyConversionRate = 0.5,
  biopsyDay5Pct = 0.5,
  biopsyDay6Pct = 0.5,
  shiftLabel,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  isPublished: boolean
  onRefresh: () => void
  taskConflictThreshold: number
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  biopsyConversionRate?: number
  biopsyDay5Pct?: number
  biopsyDay6Pct?: number
  shiftLabel?: string
}) {
  const t = useTranslations("schedule")

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-muted-foreground">{t("noRota")}</span>
      </div>
    )
  }

  const tecnicas = (data.tecnicas ?? []).filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
  const days = data.days

  if (tecnicas.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-muted-foreground">Sin técnicas configuradas</span>
      </div>
    )
  }

  // Build leave map: date → set of staff_ids
  const leaveByDate: Record<string, Set<string>> = {}
  for (const [date, ids] of Object.entries(data.onLeaveByDate)) {
    leaveByDate[date] = new Set(ids)
  }

  // Compute conflict staff per day: staff assigned to > threshold technique rows
  function getConflictStaff(day: RotaDay): Set<string> {
    const countByStaff: Record<string, number> = {}
    for (const a of day.assignments) {
      if (a.function_label) {
        countByStaff[a.staff_id] = (countByStaff[a.staff_id] ?? 0) + 1
      }
    }
    const conflicts = new Set<string>()
    for (const [id, count] of Object.entries(countByStaff)) {
      if (count > taskConflictThreshold) conflicts.add(id)
    }
    return conflicts
  }

  // Handlers
  // Compute weekStart from data
  const weekStart = data.weekStart

  async function handleAssign(staffId: string, tecnicaCodigo: string, date: string) {
    const result = await upsertAssignment({
      weekStart,
      staffId,
      date,
      shiftType: "T1" as ShiftType,
      functionLabel: tecnicaCodigo,
    })
    if (result.error) { toast.error(result.error); return }
    onRefresh()
  }

  async function handleRemove(assignmentId: string) {
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
    else onRefresh()
  }

  async function handleToggleWholeTeam(tecnicaCodigo: string, date: string, current: boolean) {
    // If toggling ON and no assignments exist, we need to create one first
    // so the whole_team flag has a row to live on
    const dayData = days.find((d) => d.date === date)
    const existingForLabel = (dayData?.assignments ?? []).filter((a) => a.function_label === tecnicaCodigo)
    if (!current && existingForLabel.length === 0 && staffList.length > 0) {
      // Create a placeholder assignment with the first available staff
      await handleAssign(staffList[0].id, tecnicaCodigo, date)
    }
    const result = await setWholeTeam(weekStart, tecnicaCodigo, date, !current)
    if (result.error) toast.error(result.error)
    onRefresh()
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background">
      <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${days.length}, 1fr)` }}>
        {/* Header row */}
        <div className="border-b border-r border-border bg-muted px-3 py-2 flex flex-col justify-center">
          {shiftLabel && (
            <span className="text-[10px] tabular-nums text-muted-foreground/70">{shiftLabel}</span>
          )}
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Técnica</span>
        </div>
        {days.map((day) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayNum = d.getDate()
          const isToday = day.date === new Date().toISOString().split("T")[0]
          const isSat = d.getDay() === 6

          // Punciones + biopsy forecast
          const defaultP = punctionsDefault[day.date] ?? 0
          const effectiveP = punctionsOverride[day.date] ?? defaultP
          const hasOverride = punctionsOverride[day.date] !== undefined

          function getPuncForDate(dateStr: string): number {
            if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
            if (punctionsDefault[dateStr] !== undefined) return punctionsDefault[dateStr]
            const dow = new Date(dateStr + "T12:00:00").getDay()
            const sameDow = Object.entries(punctionsDefault).find(([dd]) => new Date(dd + "T12:00:00").getDay() === dow)
            return sameDow ? sameDow[1] : 0
          }
          const d5ago = new Date(day.date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
          const d6ago = new Date(day.date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
          const p5 = getPuncForDate(d5ago.toISOString().split("T")[0])
          const p6 = getPuncForDate(d6ago.toISOString().split("T")[0])
          const biopsyForecast = Math.round(p5 * biopsyConversionRate * biopsyDay5Pct + p6 * biopsyConversionRate * biopsyDay6Pct)

          return (
            <div
              key={day.date}
              className={cn("border-b border-r last:border-r-0 border-border flex flex-col items-center justify-center py-1.5 gap-[2px] bg-muted", isSat && "border-l border-dashed")}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wday}</span>
              <span className={cn(
                "text-[15px] font-semibold leading-none mt-0.5",
                isToday ? "size-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center" : "text-primary"
              )}>
                {dayNum}
              </span>
              {(effectiveP > 0 || biopsyForecast > 0) && (
                <span className="flex items-center gap-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                  <span className={hasOverride ? "text-primary" : ""}>P:{effectiveP}</span>
                  <span>B:{biopsyForecast}</span>
                </span>
              )}
            </div>
          )
        })}

        {/* Technique rows */}
        {tecnicas.map((tecnica) => (
          <>
            {/* Technique label */}
            <div
              key={`label-${tecnica.id}`}
              className="border-b border-r border-border px-3 py-2 flex items-center gap-1.5"
              style={{ borderLeft: `3px solid ${resolveColor(tecnica.color)}` }}
            >
              <span className="text-[12px] font-medium truncate">{tecnica.nombre_es}</span>
            </div>
            {/* Day cells for this technique */}
            {days.map((day) => {
              const dayAssignments = day.assignments.filter(
                (a) => a.function_label === tecnica.codigo
              ) as unknown as Assignment[]
              const conflictStaff = getConflictStaff(day)
              const isSat = new Date(day.date + "T12:00:00").getDay() === 6
              const hasEmpty = dayAssignments.length === 0
              return (
                <div
                  key={`${tecnica.id}-${day.date}`}
                  className={cn(
                    "border-b border-r last:border-r-0 border-border",
                    isSat && "border-l border-dashed border-l-border",
                    hasEmpty && "bg-muted/20",
                    day.isWeekend && "bg-muted/30"
                  )}
                >
                  <TaskCell
                    tecnica={tecnica}
                    date={day.date}
                    assignments={dayAssignments}
                    staffList={staffList}
                    leaveStaffIds={leaveByDate[day.date] ?? new Set()}
                    conflictStaffIds={conflictStaff}
                    isPublished={isPublished}
                    onAssign={handleAssign}
                    onRemove={handleRemove}
                    onToggleWholeTeam={handleToggleWholeTeam}
                  />
                </div>
              )
            })}
          </>
        ))}

        {/* OFF row — unassigned + on leave */}
        <div className="border-r border-border px-3 py-2 flex items-center gap-1.5 bg-muted/40">
          <span className="text-[12px] font-medium text-muted-foreground">OFF</span>
        </div>
        {days.map((day) => {
          const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
          const leaveIds = leaveByDate[day.date] ?? new Set<string>()
          const isSat = new Date(day.date + "T12:00:00").getDay() === 6

          // Unassigned: staff not in any assignment this day and not on leave
          const unassigned = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id))
          // On leave
          const onLeave = staffList.filter((s) => leaveIds.has(s.id))

          return (
            <div
              key={`off-${day.date}`}
              className={cn(
                "border-r last:border-r-0 border-border p-1 flex flex-wrap gap-0.5 bg-muted/10",
                isSat && "border-l border-dashed border-l-border"
              )}
            >
              {onLeave.map((s) => (
                <Tooltip key={s.id}>
                  <TooltipTrigger render={
                    <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      {`${s.first_name[0]}${s.last_name[0]}`}
                    </span>
                  } />
                  <TooltipContent side="top">{s.first_name} {s.last_name} · De baja</TooltipContent>
                </Tooltip>
              ))}
              {unassigned.map((s) => (
                <Tooltip key={s.id}>
                  <TooltipTrigger render={
                    <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {`${s.first_name[0]}${s.last_name[0]}`}
                    </span>
                  } />
                  <TooltipContent side="top">{s.first_name} {s.last_name} · Sin asignar</TooltipContent>
                </Tooltip>
              ))}
              {onLeave.length === 0 && unassigned.length === 0 && (
                <span className="text-[10px] text-muted-foreground/40 italic">—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
