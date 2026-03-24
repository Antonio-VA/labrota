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

  // Only show staff with the skill for this technique (case-insensitive match)
  const tecCode = tecnica.codigo.toUpperCase()
  const qualifiedStaff = availableStaff.filter((s) =>
    s.staff_skills.some((sk) => sk.skill.toUpperCase() === tecCode)
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
          <p className="px-3 py-2 text-[11px] text-muted-foreground">Sin personal cualificado</p>
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
                disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/50"
              )}
            >
              <span className={cn(
                "size-4 rounded border flex items-center justify-center text-[9px] shrink-0 transition-colors",
                isSelected ? "bg-primary border-primary text-primary-foreground" :
                onLeave ? "border-red-300 bg-red-100" :
                "border-border bg-background"
              )}>
                {(isSelected || onLeave) && "✓"}
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground w-5 shrink-0">
                {`${s.first_name[0]}${s.last_name[0]}`}
              </span>
              <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
              {onLeave && <span className="text-[9px] text-red-500 shrink-0">Baja</span>}
              {isSelected && !onLeave && <span className="text-[9px] text-muted-foreground shrink-0">Asignado</span>}
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
  isWholeTeamOverride,
  onAssign,
  onRemove,
  onAssignSilent,
  onRemoveSilent,
  onOptimisticAdd,
  onOptimisticRemove,
  onToggleWholeTeam,
  onRefresh,
}: {
  tecnica: Tecnica
  date: string
  assignments: Assignment[]
  staffList: StaffWithSkills[]
  leaveStaffIds: Set<string>
  conflictStaffIds: Set<string>
  isPublished: boolean
  isWholeTeamOverride?: boolean
  onAssign: (staffId: string, tecnicaCodigo: string, date: string) => void
  onRemove: (assignmentId: string) => void
  onAssignSilent: (staffId: string, tecnicaCodigo: string, date: string) => Promise<void>
  onRemoveSilent: (assignmentId: string) => Promise<void>
  onOptimisticAdd: (staffId: string, functionLabel: string, date: string) => void
  onOptimisticRemove: (assignmentId: string) => void
  onToggleWholeTeam: (tecnicaCodigo: string, date: string, current: boolean) => void
  onRefresh: () => void
}) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const cellRef = useRef<HTMLDivElement>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const isWholeTeam = isWholeTeamOverride ?? assignments.some((a) => a.whole_team)
  const assignedStaffIds = new Set(assignments.map((a) => a.staff_id))

  function openSelector() {
    if (isPublished) return
    const rect = cellRef.current?.getBoundingClientRect()
    if (rect) setPopupPos({ top: rect.bottom + 4, left: rect.left })
    setSelectorOpen(true)
  }

  return (
    <div ref={cellRef} className="relative p-1 min-h-[36px] flex items-center gap-0.5 flex-wrap">
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
                "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
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

              // Compute diff
              const toAdd = selected.filter((id) => !assignedStaffIds.has(id))
              const toRemove = [...assignedStaffIds].filter((id) => !selected.includes(id))

              // Optimistic: update UI instantly
              for (const id of toRemove) {
                const a = assignments.find((x) => x.staff_id === id)
                if (a) onOptimisticRemove(a.id)
              }
              for (const id of toAdd) {
                onOptimisticAdd(id, tecnica.codigo, date)
              }

              // Server sync in background, refresh once done
              await Promise.all([
                ...(wholeTeam !== isWholeTeam ? [onToggleWholeTeam(tecnica.codigo, date, isWholeTeam)] : []),
                ...toRemove.map((id) => {
                  const a = assignments.find((x) => x.staff_id === id)
                  return a ? onRemoveSilent(a.id) : Promise.resolve()
                }),
                ...toAdd.map((id) => onAssignSilent(id, tecnica.codigo, date)),
              ])
              onRefresh()
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

// ── OFF cell ─────────────────────────────────────────────────────────────────

function OffCell({ date, day, unassigned, onLeave, staffList, assignedIds, isPublished, onMakeOff }: {
  date: string; day: RotaDay
  unassigned: StaffWithSkills[]; onLeave: StaffWithSkills[]
  staffList: StaffWithSkills[]; assignedIds: Set<string>
  isPublished: boolean
  onMakeOff: (staffId: string) => Promise<void>
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const cellRef = useRef<HTMLDivElement>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    function handler(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [pickerOpen])

  // All non-leave staff, sorted: OFF first, then assigned
  const offIds = new Set(unassigned.map((s) => s.id))
  const leaveIds = new Set(onLeave.map((s) => s.id))
  const nonLeaveStaff = staffList.filter((s) => !leaveIds.has(s.id))

  function openPicker() {
    if (isPublished) return
    const rect = cellRef.current?.getBoundingClientRect()
    if (rect) setPopupPos({ top: rect.top - 4, left: rect.left })
    setPickerOpen(true)
  }

  async function toggleOff(s: StaffWithSkills) {
    if (busy.has(s.id)) return
    setBusy((prev) => new Set(prev).add(s.id))
    await onMakeOff(s.id)
    setBusy((prev) => { const next = new Set(prev); next.delete(s.id); return next })
  }

  return (
    <div
      ref={cellRef}
      className={cn(
        "border-r last:border-r-0 border-border p-1 flex flex-wrap gap-0.5 items-start content-start bg-muted/10 min-h-[36px]",
        new Date(date + "T12:00:00").getDay() === 6 && "border-l border-l-border/50 border-dashed"
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
      {!isPublished && (
        <button
          onClick={openPicker}
          className="size-5 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          <Plus className="size-3" />
        </button>
      )}

      {pickerOpen && popupPos && createPortal(
        <div ref={popRef} style={{ position: "fixed", top: popupPos.top, left: popupPos.left, zIndex: 200, transform: "translateY(-100%)" }}>
          <div className="bg-background border border-border rounded-lg shadow-lg w-56 overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-[11px] font-medium text-muted-foreground">Marcar OFF para este día</span>
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              {onLeave.length > 0 && (
                <>
                  {onLeave.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px] opacity-40">
                      <span className="size-4 rounded border border-red-300 bg-red-100 flex items-center justify-center text-[9px] text-red-600 shrink-0">✓</span>
                      <span className="text-[10px] font-semibold text-muted-foreground w-5 shrink-0">
                        {`${s.first_name[0]}${s.last_name[0]}`}
                      </span>
                      <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
                      <span className="text-[9px] text-red-500 shrink-0">Baja</span>
                    </div>
                  ))}
                  <div className="h-px bg-border mx-2 my-1" />
                </>
              )}
              {nonLeaveStaff.map((s) => {
                const isOff = offIds.has(s.id)
                const isBusy = busy.has(s.id)
                return (
                  <button
                    key={s.id}
                    disabled={isBusy}
                    onClick={() => toggleOff(s)}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors",
                      isBusy ? "opacity-40" : "hover:bg-muted/50"
                    )}
                  >
                    <span className={cn(
                      "size-4 rounded border flex items-center justify-center text-[9px] shrink-0 transition-colors",
                      isOff
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border bg-background"
                    )}>
                      {isOff && "✓"}
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground w-5 shrink-0">
                      {`${s.first_name[0]}${s.last_name[0]}`}
                    </span>
                    <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
                    {isOff && <span className="text-[9px] text-muted-foreground shrink-0">OFF</span>}
                    {!isOff && <span className="text-[9px] text-muted-foreground/50 shrink-0">Asignado</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Punciones + Biopsy editable ───────────────────────────────────────────────

function PuncBiopsyEdit({ date, value, defaultValue, isOverride, biopsyForecast, onChange, disabled }: {
  date: string; value: number; defaultValue: number; isOverride: boolean
  biopsyForecast: number; onChange?: (date: string, value: number | null) => void; disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setDraft(String(value)) }, [value])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function save() {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n >= 0) onChange?.(date, n === defaultValue ? null : n)
    else setDraft(String(value))
    setOpen(false)
  }

  const pLabel = `P:${value}`
  const bLabel = `B:${biopsyForecast}`

  if (disabled) {
    return (value > 0 || biopsyForecast > 0) ? (
      <span className="flex items-center gap-1 text-[10px] font-medium tabular-nums text-muted-foreground">
        <span className={isOverride ? "text-primary" : ""}>{pLabel}</span>
        <span>{bLabel}</span>
      </span>
    ) : null
  }

  return (
    <div ref={popRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setOpen((o) => !o) }}
        className="flex items-center gap-1 text-[10px] font-medium tabular-nums rounded px-1 py-0.5 transition-colors hover:bg-background/80 cursor-pointer"
      >
        <span className={isOverride ? "text-primary" : "text-muted-foreground"}>{pLabel}</span>
        <span className="text-muted-foreground">{bLabel}</span>
      </button>

      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2.5 w-40 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
            <span className="text-[11px] text-muted-foreground text-right">Punciones</span>
            <input
              autoFocus
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false) }}
              className="w-12 text-[12px] text-center border border-input rounded px-1 py-0.5 outline-none focus:border-primary bg-background"
            />
            <span className="text-[11px] text-muted-foreground text-right">Biopsias</span>
            <span className="text-[12px] text-center text-muted-foreground tabular-nums">{biopsyForecast}</span>
          </div>
          <div className="flex gap-1">
            <button onClick={save} className="flex-1 text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 hover:opacity-90 transition-opacity">
              Guardar
            </button>
            {isOverride && (
              <button onClick={() => { onChange?.(date, null); setOpen(false) }} className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors">
                Reset
              </button>
            )}
          </div>
        </div>
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
  const [localDays, setLocalDays] = useState<RotaDay[]>(data?.days ?? [])
  // Local whole_team state: "tecnicaCode:date" → boolean
  const [localWholeTeam, setLocalWholeTeam] = useState<Record<string, boolean>>({})

  // Sync from server whenever data changes
  useEffect(() => {
    if (!data) return
    setLocalDays(data.days)
    // Merge whole_team from server: keys with assignments get server truth,
    // keys without assignments keep local state (optimistic toggle)
    const serverWt: Record<string, boolean> = {}
    const keysWithAssignments = new Set<string>()
    for (const day of data.days) {
      for (const a of day.assignments) {
        if (a.function_label) {
          const key = `${a.function_label}:${day.date}`
          keysWithAssignments.add(key)
          if (a.whole_team) serverWt[key] = true
        }
      }
    }
    setLocalWholeTeam((prev) => {
      const next: Record<string, boolean> = {}
      // Server-known keys: use server truth
      for (const key of keysWithAssignments) {
        next[key] = serverWt[key] ?? false
      }
      // Keys without assignments: keep local optimistic state
      for (const [key, val] of Object.entries(prev)) {
        if (!keysWithAssignments.has(key) && val) {
          next[key] = true
        }
      }
      return next
    })
  }, [data])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-muted-foreground">{t("noRota")}</span>
      </div>
    )
  }

  const tecnicas = (data.tecnicas ?? []).filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
  const days = localDays

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

  const defaultShiftCode = (data?.shiftTypes?.[0]?.code ?? "T1") as ShiftType
  const staffLookup = Object.fromEntries(staffList.map((s) => [s.id, s]))

  // Optimistic patch helpers
  function optimisticAdd(staffId: string, functionLabel: string, date: string) {
    const s = staffLookup[staffId]
    if (!s) return
    const tempId = `temp-${Date.now()}-${Math.random()}`
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId, shift_type: defaultShiftCode,
        is_manual_override: true, trainee_staff_id: null, notes: null,
        function_label: functionLabel, tecnica_id: null, whole_team: false,
        staff: { id: s.id, first_name: s.first_name, last_name: s.last_name, role: s.role as never },
      }],
    }))
  }

  function optimisticRemove(assignmentId: string) {
    setLocalDays((prev) => prev.map((d) => ({
      ...d,
      assignments: d.assignments.filter((a) => a.id !== assignmentId),
    })))
  }

  async function assignSilent(staffId: string, tecnicaCodigo: string, date: string) {
    const result = await upsertAssignment({
      weekStart, staffId, date, shiftType: defaultShiftCode, functionLabel: tecnicaCodigo,
    })
    if (result.error) toast.error(result.error)
  }

  async function removeSilent(assignmentId: string) {
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
  }

  async function handleAssign(staffId: string, tecnicaCodigo: string, date: string) {
    optimisticAdd(staffId, tecnicaCodigo, date)
    await assignSilent(staffId, tecnicaCodigo, date)
    onRefresh()
  }

  async function handleRemove(assignmentId: string) {
    optimisticRemove(assignmentId)
    await removeSilent(assignmentId)
    onRefresh()
  }

  async function handleToggleWholeTeam(tecnicaCodigo: string, date: string, current: boolean) {
    // Optimistic: toggle locally immediately
    const key = `${tecnicaCodigo}:${date}`
    setLocalWholeTeam((prev) => ({ ...prev, [key]: !current }))
    // Server sync
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
              className={cn(
                "border-b border-r last:border-r-0 border-border flex flex-col items-center justify-center py-1.5 gap-[2px] bg-muted",
                d.getDay() === 6 && "border-l border-l-border/50 border-dashed"
              )}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wday}</span>
              <span className={cn(
                "text-[15px] font-semibold leading-none mt-0.5",
                isToday ? "size-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center" : "text-primary"
              )}>
                {dayNum}
              </span>
              <PuncBiopsyEdit
                date={day.date}
                value={effectiveP}
                defaultValue={defaultP}
                isOverride={hasOverride}
                biopsyForecast={biopsyForecast}
                onChange={onPunctionsChange}
                disabled={isPublished || !data.rota}
              />
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

              const hasEmpty = dayAssignments.length === 0
              return (
                <div
                  key={`${tecnica.id}-${day.date}`}
                  className={cn(
                    "border-b border-r last:border-r-0 border-border",
                    new Date(day.date + "T12:00:00").getDay() === 6 && "border-l border-l-border/50 border-dashed",
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
                    isWholeTeamOverride={localWholeTeam[`${tecnica.codigo}:${day.date}`] ?? undefined}
                    onAssign={handleAssign}
                    onRemove={handleRemove}
                    onAssignSilent={assignSilent}
                    onRemoveSilent={removeSilent}
                    onOptimisticAdd={optimisticAdd}
                    onOptimisticRemove={optimisticRemove}
                    onToggleWholeTeam={handleToggleWholeTeam}
                    onRefresh={onRefresh}
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
          const unassigned = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id))
          const onLeave = staffList.filter((s) => leaveIds.has(s.id))

          return (
            <OffCell
              key={`off-${day.date}`}
              date={day.date}
              day={day}
              unassigned={unassigned}
              onLeave={onLeave}
              staffList={staffList}
              assignedIds={assignedIds}
              isPublished={isPublished}
              onMakeOff={async (staffId) => {
                // Remove all assignments for this staff on this day
                const toRemove = day.assignments.filter((a) => a.staff_id === staffId)
                // Optimistic: remove from UI instantly
                for (const a of toRemove) optimisticRemove(a.id)
                // Server sync in parallel
                await Promise.all(toRemove.map((a) => removeSilent(a.id)))
                onRefresh()
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
