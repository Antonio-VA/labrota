"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Lock, FileDown, CalendarX, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { getMondayOfWeek } from "@/lib/rota-engine"
import {
  getRotaWeek,
  getRotaMonthSummary,
  generateRota,
  publishRota,
  unlockRota,
  getActiveStaff,
  moveAssignment,
  setPunctionsOverride,
  moveAssignmentShift,
  removeAssignment,
  setFunctionLabel,
  upsertAssignment,
  type RotaWeekData,
  type RotaDay,
  type RotaMonthSummary,
  type ShiftTimes,
} from "@/app/(clinic)/rota/actions"
import { AssignmentSheet } from "@/components/assignment-sheet"
import type { StaffWithSkills, ShiftType, ShiftTypeDefinition } from "@/lib/types/database"

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode      = "week" | "month" | "day"
type CalendarLayout = "shift" | "person"
type Assignment    = RotaDay["assignments"][0]

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  lab:       "bg-blue-600 text-white",
  andrology: "bg-emerald-600 text-white",
  admin:     "bg-slate-500 text-white",
}

const ROLE_LABEL: Record<string, string> = {
  lab: "Lab", andrology: "Andrología", admin: "Admin",
}

const ROLE_ORDER: Record<string, number>  = { lab: 0, andrology: 1, admin: 2 }
const SHIFT_ORDER: Record<string, number> = { am: 0, pm: 1, full: 2 }

function sortAssignments<T extends { staff: { role: string }; shift_type: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const rd = (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
    if (rd !== 0) return rd
    return (SHIFT_ORDER[a.shift_type] ?? 9) - (SHIFT_ORDER[b.shift_type] ?? 9)
  })
}

const TODAY = new Date().toISOString().split("T")[0]

// ── Skill key map (DB key → i18n key) ─────────────────────────────────────────

const SKILL_KEYS: Record<string, string> = {
  icsi: "icsi", iui: "iui", vitrification: "vitrification", thawing: "thawing",
  biopsy: "biopsy", semen_analysis: "semenAnalysis", sperm_prep: "spermPrep",
  witnessing: "witnessing", egg_collection: "eggCollection", other: "other",
  embryo_transfer: "embryoTransfer", denudation: "denudation",
}

// ── The 5 skills shown in coverage row ────────────────────────────────────────

const COVERAGE_SKILLS = [
  { key: "biopsy",          label: "B"  },
  { key: "icsi",            label: "I"  },
  { key: "egg_collection",  label: "RO" },
  { key: "embryo_transfer", label: "TE" },
  { key: "denudation",      label: "D"  },
]

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

function addMonths(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split("T")[0]
}

function getMonthStart(isoDate: string): string {
  return isoDate.slice(0, 7) + "-01"
}

function formatToolbarLabel(view: ViewMode, currentDate: string, weekStart: string, locale: string): string {
  if (view === "day") {
    const d = new Date(currentDate + "T12:00:00")
    return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d)
  }
  if (view === "month") {
    const d = new Date(currentDate + "T12:00:00")
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(d)
  }
  // week
  const start = new Date(weekStart + "T12:00:00")
  const end = new Date(weekStart + "T12:00:00")
  end.setDate(start.getDate() + 6)
  const s = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(start)
  const e = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(end)
  return `${s} – ${e}`
}

// ── Staff chip (Vista por persona) ────────────────────────────────────────────

function StaffChip({ first, last, role, isOverride, hasTrainee, isOpu, notes, shiftTime, onClick, isDragging, onDragStart, onDragEnd }: {
  first: string; last: string; role: string; isOverride: boolean; hasTrainee: boolean
  isOpu?: boolean; notes?: string | null; shiftTime?: string
  onClick?: (e: React.MouseEvent) => void
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}) {
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "flex flex-col px-2 py-1 rounded-md border text-[12px] select-none",
        isOverride ? "border-primary/30 bg-primary/5" : "border-border bg-background",
        onClick && "cursor-pointer hover:bg-muted/50 active:opacity-80",
        onDragStart && "cursor-grab",
        isDragging && "opacity-40",
      )}
    >
      {shiftTime && (
        <span className="text-[10px] text-muted-foreground font-medium leading-none mb-0.5">{shiftTime}</span>
      )}
      <div className="flex items-center gap-1.5">
        <div className={cn(
          "size-5 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0",
          ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"
        )}>
          {first[0]?.toUpperCase()}{last[0]?.toUpperCase()}
        </div>
        <span className="truncate font-medium">{first} {last[0]}.</span>
        {hasTrainee && (
          <span className="ml-0.5 text-[9px] bg-primary/10 text-primary rounded px-1 font-semibold shrink-0">S</span>
        )}
        {isOpu && (
          <span className="ml-0.5 text-[9px] bg-amber-100 text-amber-700 rounded px-1 font-semibold shrink-0">OPU</span>
        )}
      </div>
      {notes && (
        <span className="text-[10px] italic text-muted-foreground leading-none mt-0.5 truncate">{notes}</span>
      )}
    </div>
  )
}

// ── Shift badge (Vista por turno — compact inline pill) ───────────────────────

type ShiftBadgeProps = {
  first: string; last: string; role: string; isOpu: boolean; isOverride: boolean
  functionLabel?: string | null
}

function ShiftBadge({ first, last, role, isOpu, isOverride, functionLabel }: ShiftBadgeProps) {
  const fnLabel = functionLabel ?? (isOpu ? "OPU" : null)
  const fnColor = fnLabel === "OPU" ? "bg-amber-100 border-amber-400 text-amber-700"
    : fnLabel === "SUP" ? "bg-purple-100 border-purple-400 text-purple-700"
    : fnLabel === "TRN" ? "bg-slate-100 border-slate-400 text-slate-600"
    : fnLabel ? "bg-blue-100 border-blue-400 text-blue-700"
    : null

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1.5 rounded border text-[13px] font-medium w-full min-h-[32px]",
      isOverride ? "border-primary/30 bg-primary/5" : "border-border bg-background"
    )}>
      <div className={cn(
        "size-5 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0",
        ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"
      )}>
        {first[0]?.toUpperCase()}{last[0]?.toUpperCase()}
      </div>
      <span className="truncate">{first} {last[0]}.</span>
      {fnLabel && fnColor && (
        <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded border ml-auto shrink-0", fnColor)}>
          {fnLabel}
        </span>
      )}
    </div>
  )
}

// ── Function label popover ────────────────────────────────────────────────────

const FUNCTION_LABELS_BY_ROLE: Record<string, string[]> = {
  lab:       ["OPU", "ICSI", "ET", "BX", "DEN", "SUP", "TRN"],
  andrology: ["AND", "SUP", "TRN"],
  admin:     [],
}

function FunctionLabelPopover({ assignment, onSave, isPublished, children }: {
  assignment: { id: string; staff: { role: string }; function_label: string | null; is_opu: boolean }
  onSave: (id: string, label: string | null) => void
  isPublished: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const available = FUNCTION_LABELS_BY_ROLE[assignment.staff.role] ?? []
  const current = assignment.function_label ?? (assignment.is_opu ? "OPU" : null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (available.length === 0 || isPublished) return <>{children}</>

  return (
    <div ref={ref} className="relative">
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className="cursor-pointer">
        {children}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-44">
          <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Función</p>
          <div className="flex flex-wrap gap-1">
            {available.map((fn) => {
              const isActive = current === fn
              const color = fn === "OPU" ? "bg-amber-100 border-amber-400 text-amber-700"
                : fn === "SUP" ? "bg-purple-100 border-purple-400 text-purple-700"
                : fn === "TRN" ? "bg-slate-100 border-slate-400 text-slate-600"
                : "bg-blue-100 border-blue-400 text-blue-700"
              return (
                <button
                  key={fn}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSave(assignment.id, isActive ? null : fn)
                    setOpen(false)
                  }}
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-opacity",
                    color,
                    isActive ? "ring-1 ring-offset-1 ring-current" : "opacity-60 hover:opacity-100"
                  )}
                >
                  {fn}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Punctions input ────────────────────────────────────────────────────────────

function PunctionsInput({ date, value, defaultValue, isOverride, onChange, disabled }: {
  date: string; value: number; defaultValue: number; isOverride: boolean
  onChange: (date: string, value: number | null) => void; disabled: boolean
}) {
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState(String(value))
  const popRef            = useRef<HTMLDivElement>(null)

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
    if (!isNaN(n) && n >= 0) onChange(date, n === defaultValue ? null : n)
    else setDraft(String(value))
    setOpen(false)
  }

  function reset() {
    onChange(date, null)
    setOpen(false)
  }

  const label = value > 0 ? `P:${value}` : "P:—"

  if (disabled) {
    return (
      <span className={cn("flex items-center gap-0.5 text-[10px] font-medium tabular-nums", isOverride ? "text-primary" : "text-muted-foreground")}>
        {label}
        {isOverride && (
          <Tooltip>
            <TooltipTrigger render={<span className="text-amber-500 font-bold cursor-default">*</span>} />
            <TooltipContent side="bottom">Valor personalizado — por defecto: {defaultValue}</TooltipContent>
          </Tooltip>
        )}
      </span>
    )
  }

  return (
    <div ref={popRef} className="relative flex items-center gap-0.5">
      <button
        onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setOpen((o) => !o) }}
        className={cn(
          "text-[10px] font-medium tabular-nums rounded px-1 py-0.5 transition-colors hover:bg-slate-100",
          isOverride ? "text-primary" : "text-muted-foreground"
        )}
        title="Editar punciones"
      >
        {label}
      </button>
      {isOverride && (
        <Tooltip>
          <TooltipTrigger render={
            <button
              onClick={(e) => { e.stopPropagation(); onChange(date, null) }}
              className="text-[10px] font-bold text-amber-500 hover:text-amber-700 transition-colors leading-none"
            >
              *
            </button>
          } />
          <TooltipContent side="bottom">Valor personalizado — por defecto: {defaultValue}. Click para restablecer</TooltipContent>
        </Tooltip>
      )}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2.5 w-36 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground shrink-0">Punciones:</span>
            <input
              autoFocus
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setOpen(false); setDraft(String(value)) } }}
              className="w-10 text-[12px] text-center border border-input rounded px-1 py-0.5 outline-none focus:border-primary bg-background"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={save}
              className="flex-1 text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 hover:opacity-90 transition-opacity"
            >
              Guardar
            </button>
            {isOverride && (
              <button
                onClick={reset}
                className="flex-1 text-[11px] text-muted-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors"
                title={`Restaurar predeterminado (${defaultValue})`}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Overflow menu (toolbar ···) ────────────────────────────────────────────────

function OverflowMenu({ items }: {
  items: { label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="icon-sm" onClick={() => setOpen((o) => !o)} aria-label="Más opciones">
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false) }}
              disabled={item.disabled}
              className="flex items-center gap-2 w-full px-4 py-2 text-[14px] text-left hover:bg-muted transition-colors disabled:opacity-50"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shift budget bar ───────────────────────────────────────────────────────────

function ShiftBudgetBar({ data }: { data: RotaWeekData }) {
  const t = useTranslations("schedule")

  const staffMap: Record<string, { first: string; last: string; role: string; count: number }> = {}
  for (const day of data.days) {
    for (const a of day.assignments) {
      if (!staffMap[a.staff_id]) {
        staffMap[a.staff_id] = { first: a.staff.first_name, last: a.staff.last_name, role: a.staff.role, count: 0 }
      }
      staffMap[a.staff_id].count++
    }
  }

  const entries = Object.entries(staffMap).sort((a, b) => {
    const roleOrder = { lab: 0, andrology: 1, admin: 2 }
    return (roleOrder[a[1].role as keyof typeof roleOrder] ?? 9) - (roleOrder[b[1].role as keyof typeof roleOrder] ?? 9)
  })

  if (entries.length === 0) return null

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground font-medium shrink-0">{t("shiftBudget")}:</span>
        {entries.map(([id, s]) => {
          const colorClass = s.count <= 5
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
          return (
            <Tooltip key={id}>
              <TooltipTrigger render={
                <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium cursor-default", colorClass)}>
                  <div className={cn(
                    "size-4 rounded-full flex items-center justify-center text-[8px] font-semibold",
                    ROLE_COLORS[s.role] ?? "bg-muted text-muted-foreground"
                  )}>
                    {s.first[0]?.toUpperCase()}{s.last[0]?.toUpperCase()}
                  </div>
                  <span>{s.count}/5</span>
                </div>
              } />
              <TooltipContent side="top">
                {s.first} {s.last} · {ROLE_LABEL[s.role] ?? s.role} · {s.count}/5 turnos
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

// ── Skill gap pill ────────────────────────────────────────────────────────────

function SkillGapPill({ details }: {
  details: { skill: string; day: string }[]
}) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const byDay: { day: string; skills: string[] }[] = []
  for (const { skill, day } of details) {
    const existing = byDay.find((d) => d.day === day)
    if (existing) existing.skills.push(skill)
    else byDay.push({ day, skills: [skill] })
  }

  const affectedDays = byDay.length

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-[12px] font-medium hover:bg-amber-100 transition-colors shrink-0"
      >
        <AlertTriangle className="size-3 shrink-0" />
        <span className="hidden sm:inline">{t("warnings")}</span>
        <span className="inline-flex items-center justify-center size-4 rounded-full bg-amber-200 text-amber-800 text-[10px] font-semibold">{affectedDays}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-border bg-background shadow-md py-1.5">
          {byDay.map(({ day, skills }) => (
            <div key={day} className="px-3 py-1.5">
              <p className="text-[12px] font-medium capitalize">{day}</p>
              <p className="text-[11px] text-muted-foreground">{skills.join(", ")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Week view (Vista por persona) ─────────────────────────────────────────────

const COLUMN_BARS: string[][] = [
  ["70%", "80%", "60%"],
  ["80%", "50%", "70%", "60%"],
  ["60%", "80%", "50%", "70%", "45%"],
  ["80%", "60%", "70%", "50%"],
  ["70%", "80%", "60%"],
  ["60%", "50%"],
  ["45%", "60%"],
]

function WeekGrid({
  data, loading, locale, onSelectDay, onCellClick, onChipClick,
  punctionsOverride, onPunctionsChange,
  draggingId, dragOverDate, onChipDragStart, onChipDragEnd, onColumnDrop, onColumnDragOver, onColumnDragLeave,
  isPublished, shiftTimes, isGenerating,
}: {
  data: RotaWeekData | null
  loading: boolean
  locale: string
  onSelectDay: (date: string) => void
  onCellClick: (date: string) => void
  onChipClick: (assignment: Assignment, date: string) => void
  punctionsOverride: Record<string, number>
  onPunctionsChange: (date: string, value: number | null) => void
  draggingId: string | null
  dragOverDate: string | null
  onChipDragStart: (assignmentId: string, fromDate: string) => void
  onChipDragEnd: () => void
  onColumnDrop: (toDate: string) => void
  onColumnDragOver: (date: string, e: React.DragEvent) => void
  onColumnDragLeave: () => void
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  isGenerating?: boolean
}) {
  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="rounded-lg border border-border overflow-hidden min-w-[560px] flex-1">
          <div className="grid grid-cols-7 h-full">
            {COLUMN_BARS.map((bars, i) => (
              <div key={i} className="flex flex-col border-r last:border-r-0">
                <div className="flex flex-col items-center py-2 border-b gap-1.5">
                  <div className="shimmer-bar h-2.5 w-6" />
                  <div className="shimmer-bar w-7 h-7 rounded-full" />
                </div>
                <div className="flex justify-center py-1.5 border-b">
                  <div className="shimmer-bar h-2 w-4" />
                </div>
                <div className="flex flex-col gap-1.5 p-2 pt-2">
                  {bars.map((w, j) => (
                    <div key={j} className="shimmer-bar h-6" style={{ width: w }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center py-1">
          <span className="generating-label text-[13px] text-muted-foreground">
            {isGenerating ? "Generando guardia…" : "Cargando…"}
          </span>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden min-w-[560px] h-full flex flex-col">
      <div className="grid grid-cols-7 flex-1">
        {data.days.map((day) => {
          const d      = new Date(day.date + "T12:00:00")
          const wday   = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayN   = String(d.getDate())
          const today  = day.date === TODAY
          const isDrop = dragOverDate === day.date && !!draggingId

          const defaultP = data.punctionsDefault[day.date] ?? 0
          const overrideP = punctionsOverride[day.date]
          const effectiveP = overrideP ?? defaultP
          const hasOverride = overrideP !== undefined

          return (
            <div
              key={day.date}
              className={cn(
                "flex flex-col border-r last:border-r-0",
                isDrop && "bg-primary/5 ring-1 ring-primary/30 ring-inset"
              )}
              onDragOver={(e) => onColumnDragOver(day.date, e)}
              onDragLeave={onColumnDragLeave}
              onDrop={() => onColumnDrop(day.date)}
            >
              <div className="flex flex-col border-b">
                <button
                  onClick={() => onSelectDay(day.date)}
                  className="flex flex-col items-center pt-2 pb-1 gap-0.5 w-full hover:bg-muted/40 transition-colors"
                >
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide">{wday}</span>
                  <div className={cn(
                    "size-7 flex items-center justify-center rounded-full text-[14px] font-medium",
                    today && "bg-primary text-primary-foreground"
                  )}>
                    {dayN}
                  </div>
                  {day.skillGaps.length > 0 && <AlertTriangle className="size-3 text-amber-500" />}
                </button>
                <div className="flex items-center justify-center gap-0.5 pb-1.5">
                  <PunctionsInput
                    date={day.date}
                    value={effectiveP}
                    defaultValue={defaultP}
                    isOverride={hasOverride}
                    onChange={onPunctionsChange}
                    disabled={isPublished || !data.rota}
                  />
                </div>
              </div>

              <div
                className="flex flex-col gap-1 p-2 flex-1 min-h-[80px]"
                onClick={() => { if (!isPublished) onCellClick(day.date) }}
              >
                {sortAssignments(day.assignments).map((a) => (
                  <StaffChip
                    key={a.id}
                    first={a.staff.first_name}
                    last={a.staff.last_name}
                    role={a.staff.role}
                    isOverride={a.is_manual_override}
                    hasTrainee={!!a.trainee_staff_id}
                    isOpu={a.is_opu}
                    notes={a.notes}
                    shiftTime={shiftTimes ? `${shiftTimes[a.shift_type]?.start ?? ""}–${shiftTimes[a.shift_type]?.end ?? ""}` : undefined}
                    isDragging={draggingId === a.id}
                    onClick={(e) => { e.stopPropagation(); onChipClick(a, day.date) }}
                    onDragStart={isPublished ? undefined : (e) => { e.stopPropagation(); onChipDragStart(a.id, day.date) }}
                    onDragEnd={onChipDragEnd}
                  />
                ))}
                {day.assignments.length === 0 && (
                  <span className={cn(
                    "text-[11px] text-muted-foreground text-center mt-4",
                    !isPublished && isDrop && "text-primary"
                  )}>—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Shift grid (Vista por turno) ──────────────────────────────────────────────

function DraggableShiftBadge({ id, ...props }: { id: string } & ShiftBadgeProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.02)`,
    opacity: isDragging ? 0.95 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? "relative" as const : undefined,
  } : undefined
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <ShiftBadge {...props} />
    </div>
  )
}

function DraggableOffStaff({ staffId, date, children, disabled }: {
  staffId: string; date: string; children: React.ReactNode; disabled?: boolean
}) {
  const id = `off-${staffId}-${date}`
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled })
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.02)`,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? "relative" as const : undefined,
  } : undefined
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={disabled ? undefined : "cursor-grab"}>
      {children}
    </div>
  )
}

function DroppableCell({ id, children, isOver, isPublished, onClick, className, style }: {
  id: string; children: React.ReactNode; isOver: boolean
  isPublished: boolean; onClick?: () => void; className?: string; style?: React.CSSProperties
}) {
  const { setNodeRef, isOver: dndIsOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={style}
      className={cn(className, (isOver || dndIsOver) && !isPublished && "bg-blue-50")}
    >
      {children}
    </div>
  )
}

function ShiftGrid({
  data, staffList, loading, locale,
  onCellClick, onChipClick,
  isPublished, isGenerating,
  shiftTimes, onLeaveByDate, publicHolidays,
  punctionsDefault, punctionsOverride, onPunctionsChange,
  onRefresh, onFunctionLabelSave, weekStart,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  onCellClick: (date: string, shiftType: ShiftType) => void
  onChipClick: (assignment: Assignment, date: string) => void
  isPublished: boolean
  isGenerating?: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  punctionsDefault: Record<string, number>
  punctionsOverride: Record<string, number>
  onPunctionsChange: (date: string, value: number | null) => void
  onRefresh: () => void
  onFunctionLabelSave: (assignmentId: string, label: string | null) => void
  weekStart: string
}) {
  const t  = useTranslations("schedule")
  const ts = useTranslations("skills")

  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId]     = useState<string | null>(null)

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverId(null)
    if (!over) return

    const activeId  = String(active.id)
    const destZone  = String(over.id)

    // ── OFF → shift: create a new assignment ─────────────────────────────────
    if (activeId.startsWith("off-")) {
      if (destZone.startsWith("OFF-")) return // dropped back on OFF — do nothing
      const destDate  = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11)
      // id format: "off-{staffId}-{date}"
      const staffId = activeId.slice(4, activeId.length - 11)
      const result = await upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift as ShiftType })
      if (result?.error) { toast.error(result.error); return }
      toast.success("Turno asignado")
      onRefresh()
      return
    }

    // ── Existing assignment → shift or OFF ────────────────────────────────────
    const assignmentId = activeId
    const sourceAssignment = data?.days.flatMap((d) => d.assignments.map((a) => ({ ...a, date: d.date }))).find((a) => a.id === assignmentId)
    if (!sourceAssignment) return

    const sourceZone = `${sourceAssignment.shift_type}-${sourceAssignment.date}`
    if (sourceZone === destZone) return

    if (destZone.startsWith("OFF-")) {
      const result = await removeAssignment(assignmentId)
      if (result?.error) { toast.error(result.error); return }
    } else {
      const destDate  = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11)

      if (sourceAssignment.date !== destDate) {
        toast.error("No se puede mover entre días")
        return
      }

      const result = await moveAssignmentShift(assignmentId, destShift)
      if (result?.error) { toast.error(result.error); return }
    }

    toast.success("Turno actualizado")
    onRefresh()
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="rounded-lg border border-border overflow-hidden min-w-[560px] flex-1">
          {/* Header */}
          <div className="grid grid-cols-[72px_repeat(7,1fr)] border-b border-[#CCDDEE]">
            <div className="border-r border-[#CCDDEE] h-[52px]" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center justify-center py-1 gap-1">
                <div className="shimmer-bar h-2.5 w-6" />
                <div className="shimmer-bar w-7 h-7 rounded-full" />
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((j) => <div key={j} className="shimmer-bar size-1.5 rounded-full" />)}
                </div>
              </div>
            ))}
          </div>
          {/* Rows */}
          {["T1", "T2", "T3", "off"].map((row) => (
            <div key={row} className={cn("grid grid-cols-[72px_repeat(7,1fr)]", row !== "off" && "border-b border-[#CCDDEE]")}>
              <div className="border-r border-[#CCDDEE] flex items-center justify-end px-2 py-3">
                <div className="shimmer-bar h-3 w-8" />
              </div>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="p-2 flex flex-col gap-1 min-h-[64px] bg-white">
                  {row !== "off" && i < 3 && <div className="shimmer-bar h-5 w-full" />}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center py-1">
          <span className="generating-label text-[13px] text-muted-foreground">
            {isGenerating ? "Generando guardia…" : "Cargando…"}
          </span>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Build skill map for coverage dots
  const staffSkillMap: Record<string, string[]> = {}
  for (const s of staffList) {
    staffSkillMap[s.id] = (s.staff_skills ?? []).map((sk) => sk.skill)
  }

  // Dynamic shift rows from data
  const SHIFT_ROWS = data.shiftTypes.map((s) => s.code)
  const shiftTypeMap = Object.fromEntries((data.shiftTypes ?? []).map((st) => [st.code, st]))

  // Find the active assignment for drag overlay
  const activeAssignment = activeId
    ? data?.days.flatMap((d) => d.assignments).find((a) => a.id === activeId)
    : null

  return (
    <DndContext
      onDragStart={(e) => { setActiveId(String(e.active.id)); setOverId(null) }}
      onDragOver={(e) => { setOverId(e.over ? String(e.over.id) : null) }}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-lg border border-[#CCDDEE] bg-white overflow-auto min-w-[560px]">

        {/* Header row — 52px, white, subtle border */}
        <div className="grid grid-cols-[72px_repeat(7,1fr)] sticky top-0 bg-white z-10 border-b border-[#CCDDEE]" style={{ minHeight: 52 }}>
          <div className="border-r border-[#CCDDEE]" />
          {data.days.map((day) => {
            const d     = new Date(day.date + "T12:00:00")
            const wday  = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
            const dayN  = String(d.getDate())
            const today = day.date === TODAY
            const isSat = d.getDay() === 6
            const holidayName = publicHolidays[day.date]

            const defaultP      = punctionsDefault[day.date] ?? 0
            const effectiveP    = punctionsOverride[day.date] ?? defaultP
            const hasOverride   = punctionsOverride[day.date] !== undefined

            return (
              <div
                key={day.date}
                className="relative flex flex-col items-center justify-center py-1 gap-[2px]"
                style={isSat ? { borderLeft: "1px dashed #e2e8f0" } : undefined}
              >
                {holidayName && (
                  <Tooltip>
                    <TooltipTrigger render={
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 cursor-default" />
                    } />
                    <TooltipContent side="bottom">{holidayName}</TooltipContent>
                  </Tooltip>
                )}

                {day.skillGaps.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger render={
                      <span className="absolute top-1 left-1 cursor-default">
                        <AlertTriangle className="size-3 text-amber-500" />
                      </span>
                    } />
                    <TooltipContent side="bottom">
                      <p className="font-medium mb-0.5">{t("warnings")}</p>
                      {day.skillGaps.map((sk) => (
                        <p key={sk} className="text-[11px] text-muted-foreground">
                          {ts(SKILL_KEYS[sk] as Parameters<typeof ts>[0])}
                        </p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                )}

                <span className="text-[11px] text-slate-400 uppercase tracking-wider leading-none">{wday}</span>
                <div className={cn(
                  "size-7 flex items-center justify-center rounded-full font-medium leading-none",
                  today
                    ? "bg-primary text-primary-foreground text-[15px]"
                    : day.isWeekend ? "text-[20px] text-slate-500" : "text-[20px] text-slate-800"
                )}>
                  {dayN}
                </div>

                {/* Punctions — clickable popover */}
                <PunctionsInput
                  date={day.date}
                  value={effectiveP}
                  defaultValue={defaultP}
                  isOverride={hasOverride}
                  onChange={onPunctionsChange}
                  disabled={isPublished || !data.rota}
                />

              </div>
            )
          })}
        </div>

        {/* Shift rows */}
        {SHIFT_ROWS.map((shiftRow) => (
          <div key={shiftRow} className="grid grid-cols-[72px_repeat(7,1fr)] border-b border-[#CCDDEE]">
            {/* Shift label — right-aligned, three-line: code / start / end */}
            <div className="border-r border-[#CCDDEE] flex flex-col items-end justify-center px-2.5 py-2">
              <span className="text-[10px] text-slate-400 leading-tight font-medium">{shiftRow}</span>
              <span className="text-[13px] font-medium text-slate-700 leading-tight tabular-nums">
                {shiftTypeMap[shiftRow]?.start_time ?? shiftRow}
              </span>
              {shiftTypeMap[shiftRow]?.end_time && (
                <span className="text-[11px] text-slate-400 leading-tight tabular-nums">
                  {shiftTypeMap[shiftRow].end_time}
                </span>
              )}
            </div>
            {data.days.map((day) => {
              const dayShifts    = [...day.assignments.filter((a) => a.shift_type === shiftRow)]
                .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
              const effectivePDay = punctionsOverride[day.date] ?? punctionsDefault[day.date] ?? 0
              const cellId = `${shiftRow}-${day.date}`
              const isSatCell = new Date(day.date + "T12:00:00").getDay() === 6
              return (
                <DroppableCell
                  key={day.date}
                  id={cellId}
                  isOver={overId === cellId}
                  isPublished={isPublished}
                  onClick={() => { if (!isPublished) onCellClick(day.date, shiftRow) }}
                  style={isSatCell ? { borderLeft: "1px dashed #e2e8f0" } : undefined}
                  className={cn(
                    "p-1.5 flex flex-col gap-1 min-h-[48px] transition-colors bg-white",
                    !isPublished && "cursor-pointer hover:bg-blue-50"
                  )}
                >
                  {dayShifts.map((a) => (
                    <FunctionLabelPopover
                      key={a.id}
                      assignment={a}
                      onSave={onFunctionLabelSave}
                      isPublished={isPublished}
                    >
                      <div onClick={(e) => { e.stopPropagation(); if (!isPublished) onChipClick(a, day.date) }}>
                        <DraggableShiftBadge
                          id={a.id}
                          first={a.staff.first_name}
                          last={a.staff.last_name}
                          role={a.staff.role}
                          isOpu={a.is_opu ?? false}
                          isOverride={a.is_manual_override}
                          functionLabel={a.function_label}
                        />
                      </div>
                    </FunctionLabelPopover>
                  ))}
                  {dayShifts.length === 0 && effectivePDay === 0 && (
                    <span className="text-[10px] text-slate-300 italic self-center mt-auto mb-auto">Sin servicio</span>
                  )}
                </DroppableCell>
              )
            })}
          </div>
        ))}

        {/* Dashed divider before OFF row */}
        <div className="h-px" style={{
          backgroundImage: "repeating-linear-gradient(90deg, #ccddee 0, #ccddee 6px, transparent 6px, transparent 12px)",
          backgroundSize: "12px 1px", backgroundRepeat: "repeat-x",
        }} />

        {/* OFF row — slate-50 bg, max 3 visible + overflow indicator */}
        <div className="grid grid-cols-[72px_repeat(7,1fr)]">
          <div className="border-r border-[#CCDDEE] flex flex-col items-end justify-start px-2.5 pt-2.5">
            <span className="text-[12px] italic text-slate-400 leading-tight">OFF</span>
          </div>
          {data.days.map((day) => {
            const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
            const leaveIds    = new Set(onLeaveByDate[day.date] ?? [])
            const dow         = new Date(day.date + "T12:00:00").getDay() // 0=Sun, 6=Sat
            const isSaturday  = dow === 6
            const offCellId   = `OFF-${day.date}`

            // Saturday → show only on-leave staff, omit full unscheduled list
            if (isSaturday) {
              const leaveStaff = staffList
                .filter((s) => !assignedIds.has(s.id) && leaveIds.has(s.id))
                .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
              return (
                <DroppableCell
                  key={day.date}
                  id={offCellId}
                  isOver={overId === offCellId}
                  isPublished={isPublished}
                  style={{ borderLeft: "1px dashed #e2e8f0" }}
                  className="p-1.5 flex flex-col gap-1 bg-white min-h-[36px]"
                >
                  {leaveStaff.map((s) => (
                    <DraggableOffStaff key={s.id} staffId={s.id} date={day.date} disabled={isPublished}>
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium w-full border-amber-200 bg-amber-50 text-amber-700">
                        <div className="size-4 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0 bg-amber-200 text-amber-800">
                          {s.first_name[0]?.toUpperCase()}{s.last_name[0]?.toUpperCase()}
                        </div>
                        <span className="truncate italic">{s.first_name} {s.last_name[0]}.</span>
                        <CalendarX className="size-3 shrink-0 ml-auto" />
                      </div>
                    </DraggableOffStaff>
                  ))}
                </DroppableCell>
              )
            }

            // Weekdays — show first 3 off staff + overflow
            const offStaff = staffList
              .filter((s) => !assignedIds.has(s.id))
              .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
            const visible  = offStaff.slice(0, 3)
            const extra    = offStaff.length - visible.length
            return (
              <DroppableCell
                key={day.date}
                id={offCellId}
                isOver={overId === offCellId}
                isPublished={isPublished}
                className="p-1.5 flex flex-col gap-1 bg-white max-h-[120px] overflow-hidden"
              >
                {visible.map((s) => {
                  const onLeave = leaveIds.has(s.id)
                  return (
                    <DraggableOffStaff key={s.id} staffId={s.id} date={day.date} disabled={isPublished}>
                      <div
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium w-full",
                          onLeave ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-100 text-slate-500"
                        )}
                      >
                        <div className={cn(
                          "size-4 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0",
                          onLeave ? "bg-amber-200 text-amber-800" : "bg-slate-200 text-slate-500"
                        )}>
                          {s.first_name[0]?.toUpperCase()}{s.last_name[0]?.toUpperCase()}
                        </div>
                        <span className={cn("truncate", onLeave && "italic")}>{s.first_name} {s.last_name[0]}.</span>
                        {onLeave && <CalendarX className="size-3 shrink-0 ml-auto" />}
                      </div>
                    </DraggableOffStaff>
                  )
                })}
                {extra > 0 && (
                  <span className="text-[11px] text-slate-400 px-1">+{extra} más</span>
                )}
              </DroppableCell>
            )
          })}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeAssignment ? (
          <div className="opacity-90 shadow-lg rounded">
            <ShiftBadge
              first={activeAssignment.staff.first_name}
              last={activeAssignment.staff.last_name}
              role={activeAssignment.staff.role}
              isOpu={activeAssignment.is_opu ?? false}
              isOverride={activeAssignment.is_manual_override}
              functionLabel={activeAssignment.function_label}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── Month view ────────────────────────────────────────────────────────────────

const DOW_HEADERS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const DOW_HEADERS_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]

function MonthGrid({ summary, loading, locale, currentDate, onSelectDay }: {
  summary: RotaMonthSummary | null
  loading: boolean
  locale: string
  currentDate: string
  onSelectDay: (date: string) => void
}) {
  const headers = locale === "es" ? DOW_HEADERS_ES : DOW_HEADERS_EN

  if (loading || !summary) {
    return (
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {headers.map((h) => (
            <div key={h} className="text-center text-[11px] font-medium text-muted-foreground py-1">{h}</div>
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, w) => (
          <div key={w} className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, d) => (
              <Skeleton key={d} className="h-14 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const weeks: (typeof summary.days)[] = []
  for (let i = 0; i < summary.days.length; i += 7) {
    weeks.push(summary.days.slice(i, i + 7))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {headers.map((h) => (
          <div key={h} className="text-center text-[11px] font-medium text-muted-foreground py-1">{h}</div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map((day) => {
            const isToday    = day.date === TODAY
            const isSelected = day.date === currentDate
            const dayNum     = String(new Date(day.date + "T12:00:00").getDate())

            return (
              <button
                key={day.date}
                onClick={() => onSelectDay(day.date)}
                className={cn(
                  "relative flex flex-col items-start p-2 rounded-lg border text-left transition-colors min-h-[56px] bg-background",
                  !day.isCurrentMonth && "opacity-40",
                  isSelected && "border-primary",
                  !isSelected && "border-border hover:bg-muted/40"
                )}
              >
                <div className={cn(
                  "size-6 flex items-center justify-center rounded-full text-[13px] font-medium mb-1",
                  isToday && "bg-primary text-primary-foreground"
                )}>
                  {dayNum}
                </div>
                {day.staffCount > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground">{day.staffCount}</span>
                    {day.hasSkillGaps && <AlertTriangle className="size-3 text-amber-500" />}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({ day, loading, locale }: {
  day: RotaDay | null
  loading: boolean
  locale: string
}) {
  const t  = useTranslations("schedule")
  const ts = useTranslations("skills")

  if (loading) {
    return (
      <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">
        <Skeleton className="h-5 w-48" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!day || day.assignments.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={t("noRota")}
        description={t("noRotaDescription")}
      />
    )
  }

  const byRole: Record<string, typeof day.assignments> = { lab: [], andrology: [], admin: [] }
  for (const a of day.assignments) {
    byRole[a.staff.role]?.push(a)
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      {(day.skillGaps.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-medium text-amber-800">{t("insufficientCoverage")}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {day.skillGaps.map((sk) => (
                <Badge key={sk} variant="skill-gap">
                  {ts(SKILL_KEYS[sk] as Parameters<typeof ts>[0])}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {(["lab", "andrology", "admin"] as const).map((role) => {
        const staff = byRole[role]
        if (!staff || staff.length === 0) return null
        return (
          <div key={role} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={role}>{role}</Badge>
              <span className="text-[13px] text-muted-foreground">{staff.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {staff.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg border",
                    a.is_manual_override ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                  )}
                >
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                    ROLE_COLORS[role]
                  )}>
                    {a.staff.first_name[0]?.toUpperCase()}{a.staff.last_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                    {a.trainee_staff_id && (
                      <p className="text-[12px] text-primary">{t("supervision")}</p>
                    )}
                    {a.notes && (
                      <p className="text-[12px] text-muted-foreground">{a.notes}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[11px] shrink-0">{a.shift_type}</Badge>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Override dialog ───────────────────────────────────────────────────────────

function OverrideDialog({ onKeep, onRegenerate, onCancel, isPending }: {
  onKeep: () => void; onRegenerate: () => void; onCancel: () => void; isPending: boolean
}) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between shrink-0">
      <div>
        <p className="text-[14px] font-medium text-amber-800">{t("preserveOverrides")}</p>
        <p className="text-[13px] text-amber-700">{t("preserveOverridesDescription")}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={onKeep} disabled={isPending}>{t("keepOverrides")}</Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isPending}>{t("regenerateAll")}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>{tc("cancel")}</Button>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CalendarPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const t      = useTranslations("schedule")
  const tc     = useTranslations("common")
  const ts     = useTranslations("skills")
  const locale = useLocale()

  const [view, setView]                 = useState<ViewMode>("week")
  const [calendarLayout, setCalendarLayoutState] = useState<CalendarLayout>("shift")
  const [currentDate, setCurrentDate]   = useState(TODAY)
  const [weekData, setWeekData]         = useState<RotaWeekData | null>(null)
  const [monthSummary, setMonthSummary] = useState<RotaMonthSummary | null>(null)
  const [loadingWeek, setLoadingWeek]   = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showOverrideDialog, setShowOverrideDialog] = useState(false)
  const [isPending, startTransition]    = useTransition()

  // Staff for assignment sheet
  const [staffList, setStaffList] = useState<StaffWithSkills[]>([])

  // Day edit sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDate, setSheetDate] = useState<string | null>(null)

  // DnD state
  const [draggingId, setDraggingId]     = useState<string | null>(null)
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  // Local punctions override
  const [punctionsOverride, setPunctionsOverrideLocal] = useState<Record<string, number>>({})

  // Derived
  const weekStart  = getMondayOfWeek(new Date(currentDate + "T12:00:00"))
  const monthStart = getMonthStart(currentDate)

  // Persist calendar layout preference
  useEffect(() => {
    const saved = localStorage.getItem("labrota_calendar_layout") as CalendarLayout | null
    if (saved === "shift" || saved === "person") setCalendarLayoutState(saved)
  }, [])

  function setCalendarLayout(layout: CalendarLayout) {
    setCalendarLayoutState(layout)
    localStorage.setItem("labrota_calendar_layout", layout)
  }

  // Fetch week data
  const fetchWeek = useCallback((ws: string) => {
    setLoadingWeek(true)
    setError(null)
    getRotaWeek(ws).then((d) => {
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
      setLoadingWeek(false)
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load schedule data.")
      setLoadingWeek(false)
    })
  }, [])

  // Silent refresh — used after drag-drop so the grid doesn't flash skeleton
  const fetchWeekSilent = useCallback((ws: string) => {
    getRotaWeek(ws).then((d) => {
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
    }).catch(() => {/* ignore — grid stays as-is */})
  }, [])

  // Fetch month summary
  const fetchMonth = useCallback((ms: string) => {
    setLoadingMonth(true)
    getRotaMonthSummary(ms).then((d) => {
      setMonthSummary(d)
      setLoadingMonth(false)
    })
  }, [])

  useEffect(() => { fetchWeek(weekStart) }, [weekStart, fetchWeek])
  useEffect(() => {
    if (view === "month") fetchMonth(monthStart)
  }, [monthStart, view, fetchMonth])

  useEffect(() => {
    if (refreshKey === 0) return
    fetchWeek(weekStart)
    if (view === "month") fetchMonth(monthStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useEffect(() => {
    getActiveStaff().then(setStaffList)
  }, [])

  // Navigation
  function navigate(dir: -1 | 1) {
    setShowOverrideDialog(false)
    if (view === "day")        setCurrentDate((d) => addDays(d, dir))
    else if (view === "week")  setCurrentDate((d) => addDays(d, dir * 7))
    else                       setCurrentDate((d) => addMonths(d, dir))
  }

  function goToToday() {
    setCurrentDate(TODAY)
    setShowOverrideDialog(false)
  }

  // Generate / publish / unlock
  function handleGenerateClick() {
    const hasAssignments = weekData?.days.some((d) => d.assignments.length > 0)
    if (hasAssignments) setShowOverrideDialog(true)
    else runGenerate(false)
  }

  function runGenerate(preserve: boolean) {
    setShowOverrideDialog(false)
    startTransition(async () => {
      try {
        const result = await generateRota(weekStart, preserve)
        if (result.error) {
          setError(result.error)
          toast.error(result.error)
        } else {
          fetchWeek(weekStart)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error generando la guardia. Consulta la consola."
        setError(msg)
        toast.error(msg)
      }
    })
  }

  function handlePublish() {
    if (!weekData?.rota) return
    startTransition(async () => {
      const result = await publishRota(weekData.rota!.id)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handleUnlock() {
    if (!weekData?.rota) return
    startTransition(async () => {
      const result = await unlockRota(weekData.rota!.id)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handleSelectDay(date: string) {
    setCurrentDate(date)
    setView("day")
  }

  function handleCellClick(date: string, _shiftType?: ShiftType) {
    setSheetDate(date)
    setSheetOpen(true)
  }

  function handleChipClick(_assignment: Assignment, date: string) {
    setSheetDate(date)
    setSheetOpen(true)
  }

  // Drag and drop
  function handleChipDragStart(assignmentId: string, fromDate: string) {
    setDraggingId(assignmentId)
    setDraggingFrom(fromDate)
  }

  function handleChipDragEnd() {
    setDraggingId(null)
    setDraggingFrom(null)
    setDragOverDate(null)
  }

  function handleColumnDragOver(date: string, e: React.DragEvent) {
    e.preventDefault()
    setDragOverDate(date)
  }

  function handleColumnDragLeave() {
    setDragOverDate(null)
  }

  function handleColumnDrop(toDate: string) {
    if (!draggingId || !draggingFrom || toDate === draggingFrom) {
      handleChipDragEnd()
      return
    }
    const id = draggingId
    handleChipDragEnd()
    startTransition(async () => {
      const result = await moveAssignment(id, toDate)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handlePunctionsChange(date: string, value: number | null) {
    if (!weekData?.rota) return
    const prevGaps = weekData.days.find((d) => d.date === date)?.skillGaps ?? []
    const rotaId = weekData.rota.id
    const ws = weekStart
    setPunctionsOverrideLocal((prev) => {
      if (value === null) {
        const { [date]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [date]: value }
    })
    startTransition(async () => {
      const result = await setPunctionsOverride(rotaId, date, value)
      if (result.error) { setError(result.error); return }
      const newData = await getRotaWeek(ws)
      setWeekData(newData)
      setPunctionsOverrideLocal(newData.rota?.punctions_override ?? {})
      const newGaps = newData.days.find((d) => d.date === date)?.skillGaps ?? []
      if (newGaps.length > prevGaps.length) {
        toast.warning("Cobertura insuficiente tras el cambio — considera regenerar la guardia")
      } else if (newGaps.length === 0 && prevGaps.length > 0) {
        toast.success("Cobertura correcta")
      }
    })
  }

  function handleFunctionLabelSave(assignmentId: string, label: string | null) {
    const ws = weekStart
    startTransition(async () => {
      const result = await setFunctionLabel(assignmentId, label)
      if (result.error) { toast.error(result.error); return }
      const newData = await getRotaWeek(ws)
      setWeekData(newData)
    })
  }

  const rota           = weekData?.rota ?? null
  const isPublished    = rota?.status === "published"
  const isDraft        = rota?.status === "draft"
  const hasAssignments = weekData?.days.some((d) => d.assignments.length > 0) ?? false
  const hasSkillGaps   = hasAssignments && (weekData?.days.some((d) => d.skillGaps.length > 0) ?? false)
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null
  const showActions    = view !== "month"

  const sheetDay = sheetDate ? (weekData?.days.find((d) => d.date === sheetDate) ?? null) : null

  const skillGapDetails = weekData?.days
    .filter((d) => d.skillGaps.length > 0)
    .flatMap((d) => {
      const dayLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric" }).format(
        new Date(d.date + "T12:00:00")
      )
      return d.skillGaps.map((sk) => ({
        skill: ts(SKILL_KEYS[sk] as Parameters<typeof ts>[0]),
        day: dayLabel,
      }))
    }) ?? []

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Desktop toolbar — LEFT · CENTRE · RIGHT */}
      <div className="hidden md:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background">

        {/* LEFT: Today · ‹ › · date range */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={goToToday} disabled={currentDate === TODAY}>
            {tc("today")}
          </Button>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label={t("previousPeriod")}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label={t("nextPeriod")}>
              <ChevronRight />
            </Button>
          </div>
          <span className="text-[14px] font-medium capitalize">
            {formatToolbarLabel(view, currentDate, weekStart, locale)}
          </span>
        </div>

        {/* CENTRE: Week · Month · Day · divider · By shift · By person */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(["week", "month", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-[13px] transition-colors",
                  view === v
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {t(`${v}View`)}
              </button>
            ))}
          </div>
          {view === "week" && (
            <>
              <span className="h-4 border-l border-border" />
              <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
                {(["shift", "person"] as CalendarLayout[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setCalendarLayout(l)}
                    className={cn(
                      "rounded-md px-3 py-1 text-[13px] transition-colors",
                      calendarLayout === l
                        ? "bg-background shadow-sm font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {t(`${l}Layout`)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: skill gap pill · generate · overflow ··· */}
        <div className="flex items-center gap-2 shrink-0">
          {hasSkillGaps && view !== "month" && (
            <SkillGapPill details={skillGapDetails} />
          )}
          {showActions && !isPublished && (
            <Button size="sm" onClick={handleGenerateClick} disabled={isPending || loadingWeek}>
              {isPending ? tc("generating") : hasAssignments ? t("regenerateRota") : t("generateRota")}
            </Button>
          )}
          {showActions && (
            <OverflowMenu items={[
              ...(hasAssignments ? [{
                label: t("exportPdf"),
                icon: <FileDown className="size-3.5" />,
                onClick: () => window.open(`/rota/${weekStart}/print`, "_blank"),
              }] : []),
              ...(isDraft && hasAssignments ? [{
                label: t("publishRota"),
                icon: <Lock className="size-3.5" />,
                onClick: handlePublish,
                disabled: isPending,
              }] : []),
              ...(isPublished ? [{
                label: t("unlockRota"),
                icon: <Lock className="size-3.5" />,
                onClick: handleUnlock,
                disabled: isPending,
              }] : []),
            ]} />
          )}
        </div>
      </div>

      {/* Mobile toolbar */}
      <div className="flex md:hidden items-center justify-between border-b px-4 py-2 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday} disabled={currentDate === TODAY}>
            {tc("today")}
          </Button>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label={t("previousPeriod")}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label={t("nextPeriod")}>
              <ChevronRight />
            </Button>
          </div>
          <span className="text-[13px] font-medium capitalize">
            {formatToolbarLabel(view, currentDate, weekStart, locale)}
          </span>
        </div>
        {showActions && !isPublished && (
          <Button size="sm" onClick={handleGenerateClick} disabled={isPending || loadingWeek}>
            {isPending ? tc("generating") : hasAssignments ? t("regenerateRota") : t("generateRota")}
          </Button>
        )}
      </div>

      {/* Banners */}
      <div className="flex flex-col gap-2 px-4 pt-2 empty:hidden shrink-0">
        {isPublished && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 flex items-center gap-2">
            <Lock className="size-3.5 text-emerald-600 shrink-0" />
            <span className="text-[13px] text-emerald-700">
              {rota?.published_at
                ? t("rotaPublishedBy", {
                    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(rota.published_at)),
                    author: "—",
                  })
                : t("rotaPublished")}
            </span>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
            <span className="text-[13px] text-destructive">{error}</span>
          </div>
        )}
        {showOverrideDialog && (
          <OverrideDialog
            onKeep={() => runGenerate(true)}
            onRegenerate={() => runGenerate(false)}
            onCancel={() => setShowOverrideDialog(false)}
            isPending={isPending}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col">

        {/* Week view */}
        {view === "week" && (
          <div className="hidden md:flex flex-col px-4 py-2 gap-4">
            {!weekData?.rota && !loadingWeek && !isPending ? (
              <EmptyState
                icon={CalendarDays}
                title={t("noRota")}
                description={t("noRotaDescription")}
                action={{ label: t("generateRota"), onClick: handleGenerateClick }}
              />
            ) : calendarLayout === "shift" ? (
              <ShiftGrid
                data={weekData}
                staffList={staffList}
                loading={loadingWeek || isPending}
                isGenerating={isPending}
                locale={locale}
                onCellClick={handleCellClick}
                onChipClick={handleChipClick}
                isPublished={!!isPublished}
                shiftTimes={weekData?.shiftTimes ?? null}
                onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                publicHolidays={weekData?.publicHolidays ?? {}}
                punctionsDefault={weekData?.punctionsDefault ?? {}}
                punctionsOverride={punctionsOverride}
                onPunctionsChange={handlePunctionsChange}
                onRefresh={() => fetchWeekSilent(weekStart)}
                onFunctionLabelSave={handleFunctionLabelSave}
                weekStart={weekStart}
              />
            ) : (
              <WeekGrid
                data={weekData}
                loading={loadingWeek || isPending}
                isGenerating={isPending}
                locale={locale}
                onSelectDay={handleSelectDay}
                onCellClick={(date) => handleCellClick(date)}
                onChipClick={handleChipClick}
                punctionsOverride={punctionsOverride}
                onPunctionsChange={handlePunctionsChange}
                draggingId={draggingId}
                dragOverDate={dragOverDate}
                onChipDragStart={handleChipDragStart}
                onChipDragEnd={handleChipDragEnd}
                onColumnDrop={handleColumnDrop}
                onColumnDragOver={handleColumnDragOver}
                onColumnDragLeave={handleColumnDragLeave}
                isPublished={!!isPublished}
                shiftTimes={weekData?.shiftTimes ?? null}
              />
            )}
            {weekData && <ShiftBudgetBar data={weekData} />}
          </div>
        )}

        {/* Month view */}
        {view === "month" && (
          <div className="hidden md:block overflow-auto flex-1 px-4 py-3">
            <div className="max-w-2xl">
              <MonthGrid
                summary={monthSummary}
                loading={loadingMonth}
                locale={locale}
                currentDate={currentDate}
                onSelectDay={handleSelectDay}
              />
            </div>
          </div>
        )}

        {/* Day view */}
        <div className={cn(
          "flex flex-col gap-4 overflow-auto px-4 py-3",
          view === "day" ? "md:flex" : "md:hidden"
        )}>
          <DayView
            day={currentDayData}
            loading={loadingWeek}
            locale={locale}
          />
        </div>
      </div>

      {/* Day edit sheet */}
      <AssignmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        date={sheetDate}
        weekStart={weekStart}
        day={sheetDay}
        staffList={staffList}
        shiftTimes={weekData?.shiftTimes ?? null}
        shiftTypes={weekData?.shiftTypes ?? []}
        punctionsDefault={sheetDate ? (weekData?.punctionsDefault[sheetDate] ?? 0) : 0}
        punctionsOverride={punctionsOverride}
        rota={weekData?.rota ?? null}
        isPublished={!!isPublished}
        onSaved={() => fetchWeek(weekStart)}
        onPunctionsChange={handlePunctionsChange}
      />
    </main>
  )
}
