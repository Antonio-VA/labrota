"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { X, Plus, Users, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { StaffWithSkills, Tecnica, ShiftType } from "@/lib/types/database"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import { upsertAssignment, removeAssignment } from "@/app/(clinic)/rota/actions"

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

function StaffSelector({
  open,
  onClose,
  tecnica,
  date,
  availableStaff,
  assignedStaffIds,
  leaveStaffIds,
  isWholeTeam,
  onToggleStaff,
  onToggleWholeTeam,
  allowWholeTeam,
}: {
  open: boolean
  onClose: () => void
  tecnica: Tecnica
  date: string
  availableStaff: StaffWithSkills[]
  assignedStaffIds: Set<string>
  leaveStaffIds: Set<string>
  isWholeTeam: boolean
  onToggleStaff: (staffId: string) => void
  onToggleWholeTeam: () => void
  allowWholeTeam: boolean
}) {
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  if (!open) return null

  // Filter staff who have this technique as a skill
  const qualifiedStaff = availableStaff.filter((s) =>
    s.staff_skills.some((sk) => sk.skill === tecnica.codigo)
  )

  const filtered = qualifiedStaff.filter((s) => {
    if (!search) return true
    const name = `${s.first_name} ${s.last_name}`.toLowerCase()
    const initials = `${s.first_name[0]}${s.last_name[0]}`.toLowerCase()
    return name.includes(search.toLowerCase()) || initials.includes(search.toLowerCase())
  })

  const assignedCount = assignedStaffIds.size
  const atCap = assignedCount >= 3

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg w-56 overflow-hidden"
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
        {/* Whole team option */}
        {allowWholeTeam && (
          <button
            onClick={onToggleWholeTeam}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors",
              isWholeTeam ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
            )}
          >
            <Users className="size-3.5" />
            <span className="flex-1">Todo el equipo</span>
            {isWholeTeam && <span className="text-[10px]">✓</span>}
          </button>
        )}
        {allowWholeTeam && <div className="h-px bg-border" />}

        {filtered.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">Sin personal cualificado</p>
        )}
        {filtered.map((s) => {
          const isAssigned = assignedStaffIds.has(s.id)
          const onLeave = leaveStaffIds.has(s.id)
          const disabled = (atCap && !isAssigned) || onLeave || isWholeTeam

          return (
            <button
              key={s.id}
              onClick={() => { if (!disabled) onToggleStaff(s.id) }}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors",
                isAssigned ? "bg-primary/10 text-primary font-medium" : disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/50"
              )}
            >
              <span className="size-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold shrink-0">
                {s.first_name[0]}{s.last_name[0]}
              </span>
              <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
              {onLeave && <span className="text-[9px] text-amber-500">De baja</span>}
              {isAssigned && <span className="text-[10px]">✓</span>}
            </button>
          )
        })}
      </div>
      <div className="p-2 border-t border-border">
        <Button size="sm" className="w-full text-[11px]" onClick={onClose}>Confirmar</Button>
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
  const isWholeTeam = assignments.some((a) => a.whole_team)
  const assignedStaffIds = new Set(assignments.map((a) => a.staff_id))

  return (
    <div className="relative p-1 min-h-[36px] flex items-center gap-0.5 flex-wrap">
      {isWholeTeam ? (
        <button
          onClick={() => !isPublished && setSelectorOpen(true)}
          className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold"
        >
          <Users className="size-2.5" />
          All
        </button>
      ) : (
        <>
          {assignments.map((a) => {
            const onLeave = leaveStaffIds.has(a.staff_id)
            const hasConflict = conflictStaffIds.has(a.staff_id)
            return (
              <Tooltip key={a.id}>
                <TooltipTrigger render={
                  <span className={cn(
                    "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold",
                    onLeave ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                    hasConflict ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                    "bg-muted text-foreground"
                  )}>
                    {a.staff.first_name[0]}{a.staff.last_name[0]}
                    {!isPublished && (
                      <button onClick={(e) => { e.stopPropagation(); onRemove(a.id) }} className="hover:text-destructive">
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
          {!isPublished && assignments.length < 3 && (
            <button
              onClick={() => setSelectorOpen(true)}
              className="size-5 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
            >
              <Plus className="size-3" />
            </button>
          )}
        </>
      )}

      {selectorOpen && (
        <StaffSelector
          open={selectorOpen}
          onClose={() => setSelectorOpen(false)}
          tecnica={tecnica}
          date={date}
          availableStaff={staffList}
          assignedStaffIds={assignedStaffIds}
          leaveStaffIds={leaveStaffIds}
          isWholeTeam={isWholeTeam}
          onToggleStaff={(staffId) => {
            if (assignedStaffIds.has(staffId)) {
              const a = assignments.find((x) => x.staff_id === staffId)
              if (a) onRemove(a.id)
            } else {
              onAssign(staffId, tecnica.codigo, date)
            }
          }}
          onToggleWholeTeam={() => onToggleWholeTeam(tecnica.codigo, date, isWholeTeam)}
          allowWholeTeam={true}
        />
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
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  isPublished: boolean
  onRefresh: () => void
  taskConflictThreshold: number
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
    })
    if (result.error) { toast.error(result.error); return }
    // Set function_label on the new assignment
    if (result.id) {
      const { setFunctionLabel } = await import("@/app/(clinic)/rota/actions")
      await setFunctionLabel(result.id, tecnicaCodigo)
    }
    onRefresh()
  }

  async function handleRemove(assignmentId: string) {
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
    else onRefresh()
  }

  async function handleToggleWholeTeam(tecnicaCodigo: string, date: string, current: boolean) {
    // TODO: implement whole_team toggle via server action
    toast.info(current ? "Todo el equipo desactivado" : "Todo el equipo activado")
    onRefresh()
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background">
      <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${days.length}, 1fr)` }}>
        {/* Header row */}
        <div className="border-b border-r border-border bg-muted px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Técnica</span>
        </div>
        {days.map((day) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayNum = d.getDate()
          const isToday = day.date === new Date().toISOString().split("T")[0]
          const isSat = d.getDay() === 6
          return (
            <div
              key={day.date}
              className={cn("border-b border-r last:border-r-0 border-border flex flex-col items-center justify-center py-1.5 bg-muted", isSat && "border-l border-dashed")}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wday}</span>
              <span className={cn(
                "text-[15px] font-semibold leading-none mt-0.5",
                isToday ? "size-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center" : "text-primary"
              )}>
                {dayNum}
              </span>
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
              style={{ borderLeft: `3px solid ${tecnica.color === "blue" ? "#60A5FA" : tecnica.color === "green" ? "#34D399" : tecnica.color === "amber" ? "#FBBF24" : tecnica.color === "purple" ? "#A78BFA" : tecnica.color === "coral" ? "#F87171" : tecnica.color === "teal" ? "#2DD4BF" : "#94A3B8"}` }}
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
      </div>
    </div>
  )
}
