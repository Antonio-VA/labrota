"use client"

import { useCallback, useEffect, useRef, useState, useTransition, Fragment } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Lock, FileDown, CalendarX, MoreHorizontal, X, UserCog, CalendarPlus, Mail, Rows3, BookmarkPlus, BookmarkCheck, Sparkles, Grid3X3, BookmarkX, Bookmark, Briefcase, CheckCircle2, Hourglass } from "lucide-react"
import { toast } from "sonner"
import { DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core"
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
  setTecnica,
  upsertAssignment,
  getStaffProfile,
  type RotaWeekData,
  type RotaDay,
  type RotaDayWarning,
  type RotaMonthSummary,
  type MonthWeekStatus,
  type ShiftTimes,
  type StaffProfileData,
  saveAsTemplate,
  getTemplates,
  applyTemplate,
  clearWeek,
} from "@/app/(clinic)/rota/actions"
import type { RotaTemplate } from "@/lib/types/database"
import { formatDate, formatDateRange, formatDateWithYear } from "@/lib/format-date"
import { AssignmentSheet } from "@/components/assignment-sheet"
import type { StaffWithSkills, ShiftType, ShiftTypeDefinition, Tecnica } from "@/lib/types/database"

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode      = "week" | "month"
type CalendarLayout = "shift" | "person"
type Assignment    = RotaDay["assignments"][0]

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_DOT: Record<string, string> = {
  lab:       "bg-blue-400",
  andrology: "bg-emerald-400",
  admin:     "bg-slate-400",
}

const ROLE_BORDER: Record<string, string> = {
  lab:       "#60A5FA",
  andrology: "#34D399",
  admin:     "#94A3B8",
}

const ROLE_LABEL: Record<string, string> = {
  lab: "Embriología", andrology: "Andrología", admin: "Admin",
}

const ROLE_ORDER: Record<string, number>  = { lab: 0, andrology: 1, admin: 2 }
const SHIFT_ORDER: Record<string, number> = { am: 0, pm: 1, full: 2 }

// Técnica pill color classes keyed by color name (matches tecnicas-tab.tsx)
const TECNICA_PILL: Record<string, string> = {
  amber:  "bg-amber-50 border-amber-300 text-amber-800",
  blue:   "bg-blue-50 border-blue-300 text-blue-700",
  green:  "bg-green-50 border-green-300 text-green-700",
  purple: "bg-purple-50 border-purple-300 text-purple-700",
  coral:  "bg-red-50 border-red-300 text-red-700",
  teal:   "bg-teal-50 border-teal-300 text-teal-700",
  slate:  "bg-slate-100 border-slate-300 text-slate-600",
  red:    "bg-red-50 border-red-400 text-red-800",
}

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
  sperm_freezing: "spermFreezing",
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

function StaffChip({ first, last, role, isOverride, hasTrainee, notes, shiftTime, onClick, isDragging, onDragStart, onDragEnd }: {
  first: string; last: string; role: string; isOverride: boolean; hasTrainee: boolean
  notes?: string | null; shiftTime?: string
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
        "flex flex-col py-1 text-[12px] select-none bg-white text-slate-700 border border-slate-200",
        onClick && "cursor-pointer hover:bg-muted/50 active:opacity-80",
        onDragStart && "cursor-grab",
        isDragging && "opacity-40",
      )}
      style={{ borderLeft: `3px solid ${ROLE_BORDER[role] ?? "#94A3B8"}`, borderRadius: 4, paddingLeft: 6, paddingRight: 8 }}
    >
      {shiftTime && (
        <span className="text-[10px] text-muted-foreground font-medium leading-none mb-0.5">{shiftTime}</span>
      )}
      <div className="flex items-center gap-1.5">
        <span className="truncate font-medium">{first} {last[0]}.</span>
        {hasTrainee && (
          <span className="ml-0.5 text-[9px] bg-primary/10 text-primary rounded px-1 font-semibold shrink-0">S</span>
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
  first: string; last: string; role: string; isOverride: boolean
  functionLabel?: string | null
  tecnica?: Tecnica | null
  compact?: boolean
}

function ShiftBadge({ first, last, role, isOverride, functionLabel, tecnica, compact = false }: ShiftBadgeProps) {
  const pillLabel = tecnica ? tecnica.codigo : (functionLabel ?? null)
  const pillColor = tecnica
    ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-slate-50 border-slate-200 text-slate-500"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded border border-slate-200 font-medium w-full bg-white text-slate-700",
        compact ? "py-0.5 px-1.5 min-h-[24px] text-[11px]" : "py-1 px-2 min-h-[28px] text-[13px]",
      )}
      style={{ borderLeft: `3px solid ${ROLE_BORDER[role] ?? "#94A3B8"}`, borderRadius: 4 }}
    >
      <span className="truncate">{first} {last[0]}.</span>
      {pillLabel && pillColor ? (
        <span className={cn("font-semibold px-1 py-0.5 rounded ml-auto shrink-0", compact ? "text-[8px]" : "text-[9px]", pillColor)}>
          {pillLabel}
        </span>
      ) : (
        <span className="text-[9px] font-medium text-slate-300 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
          + Task
        </span>
      )}
    </div>
  )
}

// Maps department to role for técnica filtering
const DEPT_FOR_ROLE: Record<string, string> = { lab: "lab", andrology: "andrology" }

// ── Assignment popover (función + técnica in one) ─────────────────────────────

function AssignmentPopover({ assignment, staffSkills, tecnicas, onFunctionSave, isPublished, children }: {
  assignment: { id: string; staff: { role: string }; function_label: string | null }
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  onFunctionSave: (id: string, label: string | null) => void
  isPublished: boolean
  children: React.ReactNode
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

  const currentLabel = assignment.function_label ?? null
  const staffSkillCodes = new Set(staffSkills.map((s) => s.skill))
  const staffDept = DEPT_FOR_ROLE[assignment.staff.role]

  // Show only técnicas from the staff's department that they are certified/trained in
  const availableTecnicas = tecnicas.filter((t) =>
    t.activa && t.department === staffDept && staffSkillCodes.has(t.codigo)
  )

  if (availableTecnicas.length === 0 || isPublished) return <>{children}</>

  return (
    <div ref={ref} className="relative">
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className="cursor-pointer">
        {children}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-44">
          <div className="flex flex-wrap gap-1.5">
            {availableTecnicas.map((tec) => {
              const isActive = currentLabel === tec.codigo
              const isTraining = staffSkills.find((s) => s.skill === tec.codigo)?.level === "training"
              const pillColor = TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue
              return (
                <button
                  key={tec.id}
                  title={tec.nombre_es}
                  onClick={(e) => {
                    e.stopPropagation()
                    onFunctionSave(assignment.id, isActive ? null : tec.codigo)
                    setOpen(false)
                  }}
                  className={cn(
                    "relative text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-opacity",
                    pillColor,
                    isActive ? "ring-1 ring-offset-1 ring-current" : "opacity-70 hover:opacity-100"
                  )}
                >
                  {isTraining && <Hourglass className="size-2 text-amber-500" />}
                  {tec.codigo}
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

// ── Staff profile panel ───────────────────────────────────────────────────────

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Vacaciones", sick: "Baja médica", personal: "Personal", other: "Otro",
}

function StaffProfilePanel({
  staffId, staffList, weekData, open, onClose,
}: {
  staffId: string | null
  staffList: StaffWithSkills[]
  weekData: RotaWeekData | null
  open: boolean
  onClose: () => void
}) {
  const localeRaw = useLocale()
  const locale    = localeRaw as "es" | "en"
  const ts        = useTranslations("skills")
  const [data, setData]       = useState<StaffProfileData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!staffId || !open) return
    setData(null)
    setLoading(true)
    getStaffProfile(staffId).then((d) => { setData(d); setLoading(false) })
  }, [staffId, open])

  const staff = staffId ? staffList.find((s) => s.id === staffId) : null

  // Shift debt: assignments in last 28 days vs expected (days_per_week × 4)
  const today28 = new Date(); today28.setDate(today28.getDate() - 28)
  const since28 = today28.toISOString().split("T")[0]
  const last4w  = (data?.recentAssignments ?? []).filter((a) => a.date >= since28).length
  const expected4w = (staff?.days_per_week ?? 5) * 4
  const debt    = last4w - expected4w

  // Weekly shift strip: this person's assignments for the current visible week
  const weekDays = weekData?.days ?? []
  const DOW_SHORT = locale === "es"
    ? ["L", "M", "X", "J", "V", "S", "D"]
    : ["M", "T", "W", "T", "F", "S", "S"]

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
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}

      {/* Side panel — 400px */}
      <div className={cn(
        "fixed right-0 top-0 bottom-0 z-50 bg-white border-l border-[#CCDDEE] shadow-xl",
        "flex flex-col transition-transform duration-200 ease-out w-[400px]",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#CCDDEE] shrink-0">
          {/* Role dot + avatar placeholder */}
          <div className={cn(
            "size-10 rounded-full flex items-center justify-center text-[14px] font-semibold text-white shrink-0",
            staff?.role === "lab" ? "bg-blue-500" : staff?.role === "andrology" ? "bg-emerald-500" : "bg-slate-400"
          )}>
            {staff ? `${staff.first_name[0]}${staff.last_name[0]}` : "—"}
          </div>
          <div className="flex-1 min-w-0">
            {staff ? (
              <>
                <p className="text-[14px] font-medium truncate">{staff.first_name} {staff.last_name}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{ROLE_LABEL[staff.role] ?? staff.role}</span>
                  <span className="text-slate-300">·</span>
                  <span>{staff.contracted_hours}h/sem</span>
                  <span className="text-slate-300">·</span>
                  <span>{staff.days_per_week}d/sem</span>
                </div>
              </>
            ) : (
              <div className="shimmer-bar h-4 w-32 rounded" />
            )}
          </div>
          <button onClick={onClose} className="size-7 flex items-center justify-center rounded hover:bg-slate-100 shrink-0">
            <X className="size-4 text-slate-500" />
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Weekly shift strip — this week's assignments */}
          <div className="px-5 py-3 border-b border-[#CCDDEE]">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">Semana actual</p>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => {
                const a = day.assignments.find((a) => a.staff_id === staffId)
                const onLeave = weekData?.onLeaveByDate[day.date]?.includes(staffId ?? "") ?? false
                const isToday = day.date === TODAY
                return (
                  <div key={day.date} className="flex flex-col items-center gap-0.5">
                    <span className={cn(
                      "text-[10px] font-medium leading-none",
                      isToday ? "text-primary" : "text-slate-400"
                    )}>
                      {DOW_SHORT[i]}
                    </span>
                    <div className={cn(
                      "w-full h-7 rounded flex items-center justify-center text-[10px] font-semibold",
                      a ? "bg-primary/10 text-primary border border-primary/20"
                        : onLeave ? "bg-amber-50 text-amber-600 border border-amber-200"
                        : "bg-slate-50 text-slate-300 border border-slate-100"
                    )}>
                      {a ? a.shift_type : onLeave ? "Aus" : "—"}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Shift debt — last 4 weeks */}
          <div className="px-5 py-3 border-b border-[#CCDDEE]">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">Deuda de turnos · 4 semanas</p>
            {loading ? (
              <div className="shimmer-bar h-6 w-24 rounded" />
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={cn(
                    "text-[24px] font-semibold tabular-nums leading-none",
                    debt < 0 ? "text-amber-600" : debt > 0 ? "text-red-600" : "text-slate-700"
                  )}>
                    {last4w}
                  </span>
                  <span className="text-[13px] text-muted-foreground">/ {expected4w} turnos</span>
                  {debt !== 0 && (
                    <span className={cn(
                      "text-[12px] font-semibold ml-auto px-1.5 py-0.5 rounded",
                      debt > 0 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {debt > 0 ? `+${debt}` : debt}
                    </span>
                  )}
                </div>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      debt < 0 ? "bg-amber-400" : debt > 0 ? "bg-red-400" : "bg-emerald-400"
                    )}
                    style={{ width: `${Math.min(100, Math.round((last4w / Math.max(expected4w, 1)) * 100))}%` }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Capacidades (skills) */}
          {staff && (
            <div className="px-5 py-3 border-b border-[#CCDDEE]">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">Capacidades</p>
              {staff.staff_skills.length === 0 ? (
                <p className="text-[12px] text-muted-foreground italic">Sin capacidades registradas</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {staff.staff_skills.map((sk) => (
                    <Tooltip key={sk.id}>
                      <TooltipTrigger render={
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full border font-medium cursor-default",
                          sk.level === "certified"
                            ? "bg-blue-50 border-blue-200 text-blue-700"
                            : "bg-amber-50 border-amber-200 text-amber-700"
                        )}>
                          {sk.level === "training" && <Hourglass className="size-2.5 text-amber-500 shrink-0" />}
                          {ts(SKILL_KEYS[sk.skill] ?? sk.skill as never)}
                        </span>
                      } />
                      <TooltipContent side="top">
                        {sk.level === "training" ? "En formación" : "Certificada"}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Last shifts */}
          <div className="px-5 py-3 border-b border-[#CCDDEE]">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">Últimos turnos</p>
            {loading ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="shimmer-bar h-4 w-full rounded" />
                ))}
              </div>
            ) : !data?.recentAssignments.length ? (
              <p className="text-[12px] text-muted-foreground italic">Sin turnos recientes</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {data.recentAssignments.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px] py-0.5">
                    <span className="text-slate-500 capitalize">{formatDate(a.date, locale)}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-slate-700">{a.shift_type}</span>
                      {a.function_label && (
                        <span className="text-[9px] px-1 py-0.5 rounded border bg-blue-50 border-blue-200 text-blue-700 font-semibold">{a.function_label}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming leaves */}
          <div className="px-5 py-3 border-b border-[#CCDDEE]">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">Próximas vacaciones</p>
            {loading ? (
              <div className="shimmer-bar h-4 w-40 rounded" />
            ) : !data?.upcomingLeaves.length ? (
              <p className="text-[12px] text-muted-foreground italic">Sin vacaciones programadas</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.upcomingLeaves.map((leave, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CalendarX className="size-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[12px] text-slate-700">{formatDateRange(leave.start_date, leave.end_date, locale)}</p>
                      <p className="text-[11px] text-muted-foreground">{LEAVE_TYPE_LABEL[leave.type] ?? leave.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key info */}
          {staff && (
            <div className="px-5 py-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">Información</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[12px]">
                <div>
                  <p className="text-muted-foreground">Incorporación</p>
                  <p className="text-slate-700 font-medium">{formatDateWithYear(staff.start_date, locale)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Antigüedad</p>
                  <p className="text-slate-700 font-medium">{tenureLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Disponible</p>
                  <p className="text-slate-700 font-medium">{(staff.working_pattern ?? []).join(", ").toUpperCase()}</p>
                </div>
                {staff.preferred_days && staff.preferred_days.length > 0 && (
                  <div>
                    <p className="text-muted-foreground">Preferidos</p>
                    <p className="text-emerald-700 font-medium">{staff.preferred_days.join(", ").toUpperCase()}</p>
                  </div>
                )}
                {staff.preferred_shift && (
                  <div>
                    <p className="text-muted-foreground">Turno preferido</p>
                    <p className="text-slate-700 font-medium">{staff.preferred_shift}</p>
                  </div>
                )}
                {staff.email && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Email</p>
                    <p className="text-slate-700 font-medium truncate">{staff.email}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer: quick actions ────────────────────────────── */}
        <div className="border-t border-[#CCDDEE] px-5 py-3 shrink-0 flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            className="flex-1 gap-1.5 text-[12px]"
            render={<a href={`/team?staff=${staffId}`} />}
          >
            <UserCog className="size-3.5" />
            Perfil
          </Button>
          <Button
            variant="outline" size="sm"
            className="flex-1 gap-1.5 text-[12px]"
            render={<a href={`/leaves?staff=${staffId}`} />}
          >
            <CalendarPlus className="size-3.5" />
            Ausencia
          </Button>
          {staff?.email && (
            <Button
              variant="outline" size="sm"
              className="flex-1 gap-1.5 text-[12px]"
              render={<a href={`mailto:${staff.email}`} />}
            >
              <Mail className="size-3.5" />
              Email
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Shift budget bar ───────────────────────────────────────────────────────────

function ShiftBudgetBar({ data, staffList, weekLabel, onPillClick, liveDays }: {
  data: RotaWeekData; staffList: StaffWithSkills[]; weekLabel: string; onPillClick?: (staffId: string) => void
  liveDays?: RotaDay[] | null
}) {
  const t = useTranslations("schedule")
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)

  const days = liveDays ?? data.days
  const staffMap: Record<string, { first: string; last: string; role: string; count: number; daysPerWeek: number }> = {}
  for (const day of days) {
    for (const a of day.assignments) {
      if (!staffMap[a.staff_id]) {
        const member = staffList.find((s) => s.id === a.staff_id)
        staffMap[a.staff_id] = {
          first: a.staff.first_name, last: a.staff.last_name, role: a.staff.role,
          count: 0, daysPerWeek: member?.days_per_week ?? 5,
        }
      }
      staffMap[a.staff_id].count++
    }
  }

  const entries = Object.entries(staffMap).sort((a, b) => {
    const roleOrder = { lab: 0, andrology: 1, admin: 2 }
    return (roleOrder[a[1].role as keyof typeof roleOrder] ?? 9) - (roleOrder[b[1].role as keyof typeof roleOrder] ?? 9)
  })

  // Measure overflow after render
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const items = el.querySelectorAll<HTMLElement>("[data-pill]")
    if (items.length === 0) { setVisibleCount(null); return }
    const containerRight = el.getBoundingClientRect().right
    let count = 0
    for (const item of items) {
      if (item.getBoundingClientRect().right <= containerRight - 80) count++
      else break
    }
    setVisibleCount(count < items.length ? count : null)
  }, [entries.length])

  // Close overflow on outside click
  useEffect(() => {
    if (!overflowOpen) return
    function handler(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [overflowOpen])

  if (entries.length === 0) return null

  const shown    = visibleCount !== null ? entries.slice(0, visibleCount) : entries
  const overflow = visibleCount !== null ? entries.slice(visibleCount) : []

  function renderPill(id: string, s: { first: string; last: string; role: string; count: number; daysPerWeek: number }) {
    const over  = s.count > s.daysPerWeek
    const under = s.count < s.daysPerWeek
    const color = s.count === 0 ? "text-slate-400" : over ? "text-red-600" : under ? "text-amber-600" : "text-slate-600"
    return (
      <Tooltip key={id}>
        <TooltipTrigger render={
          <button
            data-pill
            onClick={() => onPillClick?.(id)}
            className={cn("px-1.5 py-0.5 rounded text-[12px] transition-colors cursor-pointer hover:bg-blue-50", color)}
          >
            <span className="font-medium">{s.first}</span>{" "}
            <span className="font-normal tabular-nums">{s.count}/{s.daysPerWeek}</span>
          </button>
        } />
        <TooltipContent side="top">
          {s.first} {s.last} · {ROLE_LABEL[s.role] ?? s.role} · {s.count}/{s.daysPerWeek} turnos
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className="fixed bottom-0 right-0 z-30 h-11 bg-white border-t border-[#CCDDEE] flex items-center px-4 gap-1"
      style={{ left: 80, boxShadow: "0 -1px 4px rgba(0,0,0,0.06)" }}
    >
      {/* Left: label + pills */}
      <span className="text-[12px] text-slate-400 font-medium shrink-0 mr-1">{t("shiftBudget")}:</span>
      <div ref={containerRef} className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
        {shown.map(([id, s], i) => (
          <Fragment key={id}>
            {i > 0 && <span className="text-slate-300 text-[10px] select-none">·</span>}
            {renderPill(id, s)}
          </Fragment>
        ))}
      </div>
      {overflow.length > 0 && (
        <div ref={overflowRef} className="relative shrink-0">
          <button
            onClick={() => setOverflowOpen((o) => !o)}
            className="text-[11px] text-blue-600 font-medium hover:underline cursor-pointer ml-1"
          >
            +{overflow.length} más
          </button>
          {overflowOpen && (
            <div className="absolute bottom-full right-0 mb-2 z-50 w-60 rounded-lg border border-border bg-background shadow-lg py-2 px-1">
              <div className="flex flex-wrap gap-0.5">
                {overflow.map(([id, s]) => renderPill(id, s))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Right: week range */}
      <span className="text-[12px] text-slate-400 shrink-0 ml-auto capitalize">{weekLabel}</span>
    </div>
  )
}

function MonthBudgetBar({ summary, monthLabel, onPillClick }: {
  summary: RotaMonthSummary; monthLabel: string; onPillClick?: (staffId: string) => void
}) {
  const t = useTranslations("schedule")
  const entries = Object.entries(summary.staffTotals).sort((a, b) => {
    const roleOrder: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
    return (roleOrder[a[1].role] ?? 9) - (roleOrder[b[1].role] ?? 9)
  })

  if (entries.length === 0) return null

  // Monthly expected: days_per_week × ~4.33 (weeks in a month)
  const monthDate = new Date(summary.monthStart + "T12:00:00")
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const weeksInMonth = daysInMonth / 7

  return (
    <div
      className="fixed bottom-0 right-0 z-30 h-11 bg-white border-t border-[#CCDDEE] flex items-center px-4 gap-1"
      style={{ left: 80, boxShadow: "0 -1px 4px rgba(0,0,0,0.06)" }}
    >
      <span className="text-[12px] text-slate-400 font-medium shrink-0 mr-1">{t("shiftBudget")}:</span>
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
        {entries.map(([id, s], i) => {
          const expected = Math.round(s.daysPerWeek * weeksInMonth)
          const over = s.count > expected
          const color = s.count === 0 ? "text-slate-400" : over ? "text-amber-600" : "text-slate-600"
          return (
            <Fragment key={id}>
              {i > 0 && <span className="text-slate-300 text-[10px] select-none">·</span>}
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => onPillClick?.(id)}
                    className={cn("px-1.5 py-0.5 rounded text-[12px] transition-colors cursor-pointer hover:bg-blue-50", color)}
                  >
                    <span className="font-medium">{s.first}</span>{" "}
                    <span className="font-normal tabular-nums">{s.count}/{expected}</span>
                  </button>
                } />
                <TooltipContent side="top">
                  {s.first} {s.last} · {ROLE_LABEL[s.role] ?? s.role} · {s.count}/{expected} turnos/mes
                </TooltipContent>
              </Tooltip>
            </Fragment>
          )
        })}
      </div>
      <span className="text-[12px] text-slate-400 shrink-0 ml-auto capitalize">{monthLabel}</span>
    </div>
  )
}

// ── Skill gap pill ────────────────────────────────────────────────────────────

const WARNING_CATEGORY_LABEL: Record<string, string> = {
  coverage: "Cobertura insuficiente",
  skill_gap: "Habilidades sin cubrir",
  rule: "Reglas de planificación",
}
const WARNING_CATEGORY_ORDER: Record<string, number> = { coverage: 0, skill_gap: 1, rule: 2 }

/** Click-to-open popover for per-day warnings in column headers. */
function DayWarningPopover({ warnings }: { warnings: RotaDayWarning[] }) {
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

  // Group by category
  const groups: Record<string, string[]> = {}
  for (const w of warnings) {
    if (!groups[w.category]) groups[w.category] = []
    groups[w.category].push(w.message)
  }
  const sortedCategories = Object.keys(groups).sort(
    (a, b) => (WARNING_CATEGORY_ORDER[a] ?? 9) - (WARNING_CATEGORY_ORDER[b] ?? 9)
  )

  return (
    <div ref={ref} className="absolute top-[6px] right-[6px] z-10">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="cursor-pointer"
      >
        <AlertTriangle className="size-[14px] text-amber-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-background shadow-lg py-2 px-3">
          {sortedCategories.map((cat) => (
            <div key={cat} className="mb-2 last:mb-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                {WARNING_CATEGORY_LABEL[cat] ?? cat}
              </p>
              {groups[cat].map((msg, i) => (
                <p key={i} className="text-[11px] text-slate-600">· {msg}</p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Toolbar pill summarising all warnings for the week. Click to expand. */
function WarningsPill({ days }: { days: RotaDay[] }) {
  const t = useTranslations("schedule")
  const ts = useTranslations("skills")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const locale = useLocale()

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Collect all warnings grouped by category, then by day
  const byCategory: Record<string, { day: string; messages: string[] }[]> = {}
  for (const day of days) {
    if (day.warnings.length === 0) continue
    const dayLabel = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(
      new Date(day.date + "T12:00:00")
    )
    for (const w of day.warnings) {
      if (!byCategory[w.category]) byCategory[w.category] = []
      const existing = byCategory[w.category].find((e) => e.day === dayLabel)
      const msg = w.category === "skill_gap"
        ? w.message.split(", ").map((sk) => ts(SKILL_KEYS[sk] as Parameters<typeof ts>[0] ?? sk)).join(", ")
        : w.message
      if (existing) existing.messages.push(msg)
      else byCategory[w.category].push({ day: dayLabel, messages: [msg] })
    }
  }

  const sortedCategories = Object.keys(byCategory).sort(
    (a, b) => (WARNING_CATEGORY_ORDER[a] ?? 9) - (WARNING_CATEGORY_ORDER[b] ?? 9)
  )

  const totalDays = days.filter((d) => d.warnings.length > 0).length
  if (totalDays === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-amber-700 text-[12px] font-medium hover:bg-amber-100 transition-colors shrink-0"
      >
        <AlertTriangle className="size-3 shrink-0" />
        <span className="hidden sm:inline">{t("warnings")}</span>
        <span className="inline-flex items-center justify-center size-4 rounded-full bg-amber-200 text-amber-800 text-[10px] font-semibold">{totalDays}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-border bg-background shadow-lg py-2">
          {sortedCategories.map((cat) => (
            <div key={cat} className="px-3 py-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {WARNING_CATEGORY_LABEL[cat] ?? cat}
              </p>
              {byCategory[cat].map(({ day, messages }) => (
                <div key={day} className="mb-1 last:mb-0">
                  <span className="text-[12px] font-medium capitalize">{day}: </span>
                  <span className="text-[11px] text-slate-600">{messages.join(", ")}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Person view (Vista por persona) ───────────────────────────────────────────

const ROLE_LABEL_MAP: Record<string, string> = {
  lab: "Embriología", andrology: "Andrología", admin: "Administración",
}

function PersonShiftPill({ assignment, shiftTimes, tecnica, onClick }: {
  assignment: Assignment
  shiftTimes: ShiftTimes | null
  tecnica: Tecnica | null
  onClick?: (e: React.MouseEvent) => void
}) {
  const { shift_type, is_manual_override, function_label } = assignment
  const time = shiftTimes?.[shift_type]
  const pillLabel = tecnica ? tecnica.codigo : (function_label ?? null)
  const pillColor = tecnica
    ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-slate-50 border-slate-200 text-slate-500"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full rounded border px-1.5 py-1 flex flex-col gap-0.5 bg-white select-none",
        !onClick ? "cursor-default" : "cursor-pointer hover:bg-slate-50",
        is_manual_override ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[12px] font-semibold text-slate-700">{shift_type}</span>
        {pillLabel && pillColor && (
          <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0", pillColor)}>
            {pillLabel}
          </span>
        )}
      </div>
      {time && (
        <span className="text-[10px] text-slate-400 tabular-nums leading-none">
          {time.start}–{time.end}
        </span>
      )}
    </div>
  )
}

function PersonGrid({
  data, staffList, loading, locale,
  isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick,
  isGenerating,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  onChipClick: (assignment: Assignment, date: string) => void
  onDateClick?: (date: string) => void
  isGenerating?: boolean
}) {
  const [localDays, setLocalDays] = useState(data?.days ?? [])
  useEffect(() => { if (data) setLocalDays(data.days) }, [data])

  function patchLocalAssignment(assignmentId: string, patch: Record<string, unknown>) {
    setLocalDays((prev) => prev.map((d) => ({
      ...d,
      assignments: d.assignments.map((a) =>
        a.id === assignmentId ? { ...a, ...patch } : a
      ),
    })))
  }

  async function handleFunctionLabelSave(assignmentId: string, label: string | null) {
    patchLocalAssignment(assignmentId, { function_label: label })
    const result = await setFunctionLabel(assignmentId, label)
    if (result.error) toast.error(result.error)
  }

  async function handleTecnicaSave(assignmentId: string, tecnicaId: string | null) {
    patchLocalAssignment(assignmentId, { tecnica_id: tecnicaId })
    const result = await setTecnica(assignmentId, tecnicaId)
    if (result.error) toast.error(result.error)
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="rounded-lg border border-border overflow-hidden w-full">
          <div style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)" }}>
            <div className="h-[52px] border-b border-r border-[#CCDDEE]" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center py-2 border-b border-r last:border-r-0 border-[#CCDDEE] gap-1">
                <div className="shimmer-bar h-2.5 w-6" />
                <div className="shimmer-bar w-7 h-7 rounded-full" />
              </div>
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <Fragment key={i}>
                <div className="px-3 py-2.5 border-b border-r border-[#CCDDEE]">
                  <div className="shimmer-bar h-3 w-28" />
                </div>
                {Array.from({ length: 7 }).map((_, j) => (
                  <div key={j} className="p-1.5 border-b border-r last:border-r-0 border-[#CCDDEE] min-h-[48px]">
                    {j < 5 && <div className="shimmer-bar h-9 w-full rounded" />}
                  </div>
                ))}
              </Fragment>
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

  // Build assignment lookup: staffId → date → assignment
  const assignMap: Record<string, Record<string, Assignment>> = {}
  for (const day of localDays) {
    for (const a of day.assignments) {
      if (!assignMap[a.staff_id]) assignMap[a.staff_id] = {}
      assignMap[a.staff_id][day.date] = a
    }
  }

  // Active staff sorted by role then last name
  const activeStaff = staffList
    .filter((s) => s.onboarding_status !== "inactive")
    .sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      return ro !== 0 ? ro : a.last_name.localeCompare(b.last_name)
    })

  // Group by role
  const roleGroups: { role: string; members: StaffWithSkills[] }[] = []
  for (const s of activeStaff) {
    const last = roleGroups[roleGroups.length - 1]
    if (last && last.role === s.role) last.members.push(s)
    else roleGroups.push({ role: s.role, members: [s] })
  }

  const days = localDays

  return (
    <div className="rounded-lg border border-border overflow-hidden w-full">
      <div style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)" }}>

        {/* Header row */}
        <div className="px-3 py-2 border-b border-r border-[#CCDDEE] bg-white sticky left-0 z-10" />
        {days.map((day) => {
          const d       = new Date(day.date + "T12:00:00")
          const wday    = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayN    = String(d.getDate())
          const today   = day.date === TODAY
          const holiday = publicHolidays[day.date]
          return (
            <div key={day.date} className={cn(
              "flex flex-col items-center py-2 border-b border-r last:border-r-0 border-[#CCDDEE]",
              holiday ? "bg-red-50/50" : "bg-white"
            )}>
              <button
                onClick={() => onDateClick?.(day.date)}
                className={cn("flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
              >
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide">{wday}</span>
                <div className={cn(
                  "size-7 flex items-center justify-center rounded-full text-[14px] font-medium",
                  today && "bg-primary text-primary-foreground"
                )}>
                  {dayN}
                </div>
              </button>
              {day.skillGaps.length > 0 && <AlertTriangle className="size-3 text-amber-500" />}
            </div>
          )
        })}

        {/* Role groups */}
        {roleGroups.map(({ role, members }) => (
          <Fragment key={role}>
            {/* Role header — spans all 8 columns */}
            <div
              className="px-3 py-1 bg-slate-50 border-b border-[#CCDDEE] flex items-center gap-1.5"
              style={{ gridColumn: "1 / -1" }}
            >
              <span className={cn("size-1.5 rounded-full shrink-0", ROLE_DOT[role] ?? "bg-slate-400")} />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {ROLE_LABEL_MAP[role] ?? role}
              </span>
            </div>

            {/* Member rows */}
            {members.map((s) => {
              const staffAssigns = assignMap[s.id] ?? {}
              return (
                <Fragment key={s.id}>
                  {/* Name cell */}
                  <div className="px-3 py-2 border-b border-r border-[#CCDDEE] bg-white sticky left-0 z-10 flex items-center min-w-0 min-h-[48px]">
                    <span className="text-[13px] font-medium truncate leading-tight">
                      {s.first_name} {s.last_name}
                    </span>
                  </div>

                  {/* Day cells */}
                  {days.map((day) => {
                    const assignment = staffAssigns[day.date]
                    const onLeave    = (onLeaveByDate[day.date] ?? []).includes(s.id)
                    const tecnica    = assignment
                      ? (data.tecnicas ?? []).find((t) => t.id === assignment.tecnica_id) ?? null
                      : null
                    return (
                      <div
                        key={day.date}
                        className="px-1.5 py-1.5 border-b border-r last:border-r-0 border-[#CCDDEE] bg-white min-h-[48px] flex items-center"
                      >
                        {assignment ? (
                          <AssignmentPopover
                            assignment={assignment}
                            staffSkills={s.staff_skills ?? []}
                            tecnicas={data?.tecnicas ?? []}
                            onFunctionSave={handleFunctionLabelSave}
                            isPublished={isPublished}
                          >
                            <Tooltip>
                              <TooltipTrigger render={
                                <div>
                                  <PersonShiftPill
                                    assignment={assignment}
                                    shiftTimes={shiftTimes}
                                    tecnica={tecnica}
                                  />
                                </div>
                              } />
                              <TooltipContent side="top">
                                {assignment.shift_type}{tecnica ? ` · ${tecnica.nombre_es}` : assignment.function_label ? ` · ${assignment.function_label}` : ""}
                              </TooltipContent>
                            </Tooltip>
                          </AssignmentPopover>
                        ) : onLeave ? (
                          <span className="text-[11px] text-slate-400 italic">Aus.</span>
                        ) : (
                          <span className="text-[11px] text-slate-400 select-none">OFF</span>
                        )}
                      </div>
                    )
                  })}
                </Fragment>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// ── Shift grid (Vista por turno) ──────────────────────────────────────────────

function DraggableShiftBadge({ id, ...props }: { id: string } & ShiftBadgeProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.02)`,
    opacity: isDragging ? 0 : 1,
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
    opacity: isDragging ? 0 : 1,
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
  onRefresh, weekStart, compact, onDateClick, onLocalDaysChange,
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
  weekStart: string
  compact?: boolean
  onDateClick?: (date: string) => void
  onLocalDaysChange?: (days: RotaDay[]) => void
}) {
  const t  = useTranslations("schedule")
  const ts = useTranslations("skills")

  // Require 5px movement before drag activates — allows click events to pass through
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId]     = useState<string | null>(null)
  const [localDays, setLocalDaysRaw] = useState(data?.days ?? [])
  const setLocalDays: typeof setLocalDaysRaw = (update) => {
    setLocalDaysRaw((prev) => {
      const next = typeof update === "function" ? update(prev) : update
      onLocalDaysChange?.(next)
      return next
    })
  }

  // Sync local state whenever server data arrives
  useEffect(() => { if (data) { setLocalDaysRaw(data.days); onLocalDaysChange?.(data.days) } }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  function patchLocalAssignment(assignmentId: string, patch: Record<string, unknown>) {
    setLocalDays((prev) => prev.map((d) => ({
      ...d,
      assignments: d.assignments.map((a) =>
        a.id === assignmentId ? { ...a, ...patch } : a
      ),
    })))
  }

  async function handleFunctionLabelSave(assignmentId: string, label: string | null) {
    patchLocalAssignment(assignmentId, { function_label: label })
    const result = await setFunctionLabel(assignmentId, label)
    if (result.error) { toast.error(result.error); onRefresh() }
  }

  async function handleTecnicaSave(assignmentId: string, tecnicaId: string | null) {
    patchLocalAssignment(assignmentId, { tecnica_id: tecnicaId })
    const result = await setTecnica(assignmentId, tecnicaId)
    if (result.error) { toast.error(result.error); onRefresh() }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverId(null)
    if (!over) return

    const activeId = String(active.id)
    const destZone = String(over.id)

    // ── OFF → shift: create a new assignment ─────────────────────────────────
    if (activeId.startsWith("off-")) {
      if (destZone.startsWith("OFF-")) return
      const destDate  = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11) as ShiftType
      const staffId   = activeId.slice(4, activeId.length - 11)
      const staffMember = staffList.find((s) => s.id === staffId)

      // Optimistic: add a placeholder assignment immediately
      if (staffMember) {
        setLocalDays((prev) => prev.map((d) => {
          if (d.date !== destDate) return d
          const optimistic = {
            id: `opt-${Date.now()}`, staff_id: staffId,
            staff: { id: staffId, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never },
            shift_type: destShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null,
          }
          return { ...d, assignments: [...d.assignments, optimistic as Assignment] }
        }))
      }

      try {
        const result = await upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift })
        if (result?.error) { toast.error(result.error); onRefresh(); return }
        const newId = result.id
        toast.success("Turno asignado", {
          action: newId ? {
            label: "Deshacer",
            onClick: async () => {
              await removeAssignment(newId)
              onRefresh()
            },
          } : undefined,
        })
      } catch {
        toast.error("Error al asignar turno")
      } finally {
        onRefresh()
      }
      return
    }

    // ── Existing assignment → shift or OFF ────────────────────────────────────
    const assignmentId    = activeId
    const sourceAssignment = localDays.flatMap((d) => d.assignments.map((a) => ({ ...a, date: d.date }))).find((a) => a.id === assignmentId)
    if (!sourceAssignment) return

    const sourceZone = `${sourceAssignment.shift_type}-${sourceAssignment.date}`
    if (sourceZone === destZone) return

    if (destZone.startsWith("OFF-")) {
      // Optimistic: remove immediately
      setLocalDays((prev) => prev.map((d) => ({
        ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId),
      })))
      const oldShift = sourceAssignment.shift_type as ShiftType
      const oldDate  = sourceAssignment.date
      const oldStaff = sourceAssignment.staff_id
      try {
        const result = await removeAssignment(assignmentId)
        if (result?.error) { toast.error(result.error); onRefresh(); return }
        toast.success("Turno eliminado", {
          action: {
            label: "Deshacer",
            onClick: async () => {
              await upsertAssignment({ weekStart, staffId: oldStaff, date: oldDate, shiftType: oldShift })
              onRefresh()
            },
          },
        })
      } catch {
        toast.error("Error al eliminar turno")
        onRefresh()
      }
    } else {
      const destDate  = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11)

      if (sourceAssignment.date !== destDate) {
        toast.error("No se puede mover entre días")
        return
      }

      const oldShift = sourceAssignment.shift_type
      // Optimistic: change shift_type immediately
      setLocalDays((prev) => prev.map((d) => ({
        ...d, assignments: d.assignments.map((a) =>
          a.id === assignmentId ? { ...a, shift_type: destShift, is_manual_override: true } : a
        ),
      })))
      try {
        const result = await moveAssignmentShift(assignmentId, destShift)
        if (result?.error) { toast.error(result.error); onRefresh(); return }
        toast.success("Turno actualizado", {
          action: {
            label: "Deshacer",
            onClick: async () => {
              await moveAssignmentShift(assignmentId, oldShift)
              onRefresh()
            },
          },
        })
      } catch {
        toast.error("Error al mover turno")
        onRefresh()
      }
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="rounded-lg border border-border overflow-hidden w-full">
          {/* Header */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-[#CCDDEE]">
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
            <div key={row} className={cn("grid grid-cols-[80px_repeat(7,1fr)]", row !== "off" && "border-b border-[#CCDDEE]")}>
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
    ? localDays.flatMap((d) => d.assignments).find((a) => a.id === activeId)
    : null

  // Find the active off-staff member for drag overlay (id = "off-{staffId}-{date}")
  const activeOffStaff = activeId?.startsWith("off-")
    ? staffList.find((s) => activeId.startsWith(`off-${s.id}`))
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => { setActiveId(String(e.active.id)); setOverId(null) }}
      onDragOver={(e) => { setOverId(e.over ? String(e.over.id) : null) }}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-lg border border-[#CCDDEE] bg-white overflow-hidden w-full">

        {/* Header row — 52px, white, subtle border */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] sticky top-0 bg-white z-10 border-b border-[#CCDDEE]" style={{ minHeight: 52 }}>
          <div className="border-r border-[#CCDDEE]" />
          {localDays.map((day) => {
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

                {day.warnings.length > 0 && (
                  <DayWarningPopover warnings={day.warnings} />
                )}

                <button
                  onClick={() => onDateClick?.(day.date)}
                  className={cn("flex flex-col items-center gap-[2px] cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
                >
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider leading-none">{wday}</span>
                  <div className={cn(
                    "size-7 flex items-center justify-center rounded-full font-medium leading-none",
                    today
                      ? "bg-primary text-primary-foreground text-[15px]"
                      : day.isWeekend ? "text-[20px] text-slate-500" : "text-[20px] text-slate-800"
                  )}>
                    {dayN}
                  </div>
                </button>

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
          <div key={shiftRow} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-[#CCDDEE]">
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
            {localDays.map((day) => {
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
                    "p-1.5 flex flex-col gap-1 bg-white",
                    compact ? "min-h-[32px]" : "min-h-[48px]",
                    !isPublished && "cursor-pointer"
                  )}
                >
                  {dayShifts.map((a) => {
                    const staffMember = staffList.find((s) => s.id === a.staff_id)
                    const tecnica = (data?.tecnicas ?? []).find((t) => t.id === a.tecnica_id) ?? null
                    return (
                      <AssignmentPopover
                        key={a.id}
                        assignment={a}
                        staffSkills={staffMember?.staff_skills ?? []}
                        tecnicas={data?.tecnicas ?? []}
                        onFunctionSave={handleFunctionLabelSave}
                        isPublished={isPublished}
                      >
                        <Tooltip>
                          <TooltipTrigger render={
                            <div>
                              <DraggableShiftBadge
                                id={a.id}
                                first={a.staff.first_name}
                                last={a.staff.last_name}
                                role={a.staff.role}
                                                                isOverride={a.is_manual_override}
                                functionLabel={a.function_label}
                                tecnica={tecnica}
                                compact={compact}
                              />
                            </div>
                          } />
                          <TooltipContent side="top">
                            {a.staff.first_name} {a.staff.last_name} · {ROLE_LABEL[a.staff.role] ?? a.staff.role}{tecnica ? ` · ${tecnica.nombre_es}` : a.function_label ? ` · ${a.function_label}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      </AssignmentPopover>
                    )
                  })}
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

        {/* OFF row */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] bg-slate-50">
          <div className="border-r border-[#CCDDEE] flex flex-col items-end justify-center px-2.5 py-2">
            <span className="text-[10px] text-slate-400 leading-tight font-medium uppercase tracking-wide">OFF</span>
          </div>
          {localDays.map((day) => {
            const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
            const leaveIds    = new Set(onLeaveByDate[day.date] ?? [])
            const dow         = new Date(day.date + "T12:00:00").getDay() // 0=Sun, 6=Sat
            const isSaturday  = dow === 6
            const offCellId   = `OFF-${day.date}`

            // Show all unassigned staff every day (weekday and Saturday)
            const offStaff = staffList
              .filter((s) => !assignedIds.has(s.id))
              .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
            return (
              <DroppableCell
                key={day.date}
                id={offCellId}
                isOver={overId === offCellId}
                isPublished={isPublished}
                style={isSaturday ? { borderLeft: "1px dashed #e2e8f0" } : undefined}
                className="p-1.5 flex flex-col gap-1 bg-slate-50"
              >
                {offStaff.map((s) => {
                  const onLeave = leaveIds.has(s.id)
                  return (
                    <DraggableOffStaff key={s.id} staffId={s.id} date={day.date} disabled={isPublished}>
                      <div
                        className={cn(
                          "flex items-center gap-1 py-0.5 text-[11px] font-medium w-full border border-slate-200",
                          onLeave ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-slate-500"
                        )}
                        style={{ borderLeft: `3px solid ${onLeave ? "#FBBF24" : ROLE_BORDER[s.role] ?? "#94A3B8"}`, borderRadius: 4, paddingLeft: 5, paddingRight: 6 }}
                      >
                        <span className={cn("truncate", onLeave && "italic")}>{s.first_name} {s.last_name[0]}.</span>
                        {onLeave && <CalendarX className="size-3 shrink-0 ml-auto" />}
                      </div>
                    </DraggableOffStaff>
                  )
                })}
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
                            isOverride={activeAssignment.is_manual_override}
              functionLabel={activeAssignment.function_label}
              tecnica={(data?.tecnicas ?? []).find((t) => t.id === activeAssignment.tecnica_id) ?? null}
            />
          </div>
        ) : activeOffStaff ? (
          <div className="opacity-90 shadow-lg rounded">
            <ShiftBadge
              first={activeOffStaff.first_name}
              last={activeOffStaff.last_name}
              role={activeOffStaff.role}
                            isOverride={false}
              functionLabel={null}
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

function MonthGrid({ summary, loading, locale, currentDate, onSelectDay, onSelectWeek }: {
  summary: RotaMonthSummary | null
  loading: boolean
  locale: string
  currentDate: string
  onSelectDay: (date: string) => void
  onSelectWeek: (weekStart: string) => void
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
              <Skeleton key={d} className="h-20 rounded-lg" />
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

  const weekStatusMap = Object.fromEntries(summary.weekStatuses.map((ws) => [ws.weekStart, ws.status]))

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {headers.map((h) => (
          <div key={h} className="text-center text-[11px] font-medium text-muted-foreground py-1">{h}</div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const weekStart = week[0].date
        const weekStatus = weekStatusMap[weekStart] ?? null
        return (
          <div key={wi} className="relative group/week">
            {/* Week status pill */}
            {weekStatus && (
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full z-10 hidden lg:block">
                <span className={cn(
                  "text-[9px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap",
                  weekStatus === "published"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                )}>
                  {weekStatus === "published" ? "Publicada" : "Borrador"}
                </span>
              </div>
            )}

            <div
              className="grid grid-cols-7 gap-1 rounded-lg transition-colors cursor-pointer group-hover/week:bg-blue-50/40"
              onClick={() => onSelectWeek(weekStart)}
            >
              {week.map((day) => {
                const isToday    = day.date === TODAY
                const dayNum     = String(new Date(day.date + "T12:00:00").getDate())

                const tooltipParts: string[] = []
                if (day.staffCount > 0) tooltipParts.push(`${day.staffCount} personas`)
                if (day.punctions > 0) tooltipParts.push(`${day.punctions} punciones`)
                if (day.leaveCount > 0) tooltipParts.push(`${day.leaveCount} ausencias`)
                if (day.hasSkillGaps) tooltipParts.push("Habilidades sin cubrir")
                if (day.holidayName) tooltipParts.push(day.holidayName)
                const tooltipText = tooltipParts.length > 0 ? tooltipParts.join(" · ") : null

                return (
                  <Tooltip key={day.date}>
                    <TooltipTrigger render={
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectDay(day.date) }}
                    className={cn(
                      "relative flex flex-col items-start p-2 rounded-lg border text-left transition-colors min-h-[80px]",
                      !day.isCurrentMonth
                        ? "bg-slate-50 border-slate-100"
                        : day.holidayName
                        ? "bg-amber-50/40 border-amber-100"
                        : "bg-white border-border hover:bg-muted/30"
                    )}
                  >
                    {/* Top row: date + coverage indicator */}
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className={cn(
                        "size-6 flex items-center justify-center rounded-full text-[13px] leading-none",
                        isToday ? "bg-primary text-primary-foreground font-semibold"
                          : !day.isCurrentMonth ? "text-slate-300 font-normal"
                          : "font-medium text-slate-800"
                      )}>
                        {dayNum}
                      </div>
                      {day.staffCount > 0 && (
                        day.hasSkillGaps
                          ? <AlertTriangle className="size-3 text-amber-500" />
                          : <CheckCircle2 className="size-3 text-emerald-400" />
                      )}
                    </div>

                    {/* Holiday name */}
                    {day.holidayName && day.isCurrentMonth && (
                      <span className="text-[9px] text-amber-600 leading-tight truncate w-full">{day.holidayName}</span>
                    )}

                    {/* Staff info */}
                    {day.staffCount > 0 && day.isCurrentMonth && (
                      <div className="flex items-center gap-1 mt-auto">
                        <span className="text-[11px] text-slate-500">{day.staffCount}p</span>
                        {/* Role dots */}
                        <div className="flex gap-0.5">
                          {day.staffRoles.map((role, i) => (
                            <span key={i} className={cn("size-1.5 rounded-full", ROLE_DOT[role] ?? "bg-slate-400")} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bottom row: punctions + leave */}
                    {day.isCurrentMonth && (day.punctions > 0 || day.leaveCount > 0) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {day.punctions > 0 && (
                          <span className="text-[10px] text-slate-400 tabular-nums">P:{day.punctions}</span>
                        )}
                        {day.leaveCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                            <Briefcase className="size-2.5" />{day.leaveCount}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                    } />
                    {tooltipText && <TooltipContent side="top">{tooltipText}</TooltipContent>}
                  </Tooltip>
                )
              })}
            </div>
          </div>
        )
      })}
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
                  <span className={cn("size-2 rounded-full shrink-0", ROLE_DOT[role] ?? "bg-slate-400")} />
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

type GenerationStrategy = "strict_template" | "flexible_template" | "ai_optimal" | "manual"

const STRATEGY_CARDS: { key: GenerationStrategy; icon: React.ReactNode; title: string; desc: string; badge: string; badgeColor: string }[] = [
  {
    key: "strict_template", icon: <BookmarkX className="size-5" />,
    title: "Plantilla estricta",
    desc: "Usa una plantilla guardada como base. Las asignaciones se copian exactamente, respetando solo ausencias aprobadas.",
    badge: "HARD", badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    key: "flexible_template", icon: <Bookmark className="size-5" />,
    title: "Plantilla flexible",
    desc: "Usa una plantilla como punto de partida. El algoritmo ajusta según disponibilidad, reglas y preferencias de turno.",
    badge: "SOFT", badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    key: "ai_optimal", icon: <Sparkles className="size-5" />,
    title: "Óptimo IA",
    desc: "El agente genera la guardia óptima desde cero usando todas las reglas, preferencias, habilidades y equidad de turnos.",
    badge: "IA", badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    key: "manual", icon: <Grid3X3 className="size-5" />,
    title: "Semana en blanco",
    desc: "Empieza con una guardia vacía y asigna los turnos manualmente.",
    badge: "MANUAL", badgeColor: "bg-slate-50 text-slate-600 border-slate-200",
  },
]

function GenerationStrategyModal({ open, weekStart, weekLabel, onClose, onGenerate }: {
  open: boolean; weekStart: string; weekLabel: string
  onClose: () => void
  onGenerate: (strategy: GenerationStrategy, templateId?: string) => void
}) {
  const tc = useTranslations("common")
  const [selected, setSelected] = useState<GenerationStrategy | null>(null)
  const [templates, setTemplates] = useState<RotaTemplate[]>([])
  const [loadingTpl, setLoadingTpl] = useState(false)
  const [selectedTplId, setSelectedTplId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setSelected(null); setSelectedTplId(null); return }
    setLoadingTpl(true)
    getTemplates().then((d) => { setTemplates(d); setLoadingTpl(false) })
  }, [open])

  if (!open) return null

  const needsTemplate = selected === "strict_template" || selected === "flexible_template"
  const canGenerate = selected && (!needsTemplate || selectedTplId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-[#CCDDEE] shadow-xl w-[520px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#CCDDEE] shrink-0">
          <p className="text-[15px] font-medium">Generar guardia — <span className="capitalize">{weekLabel}</span></p>
        </div>

        {/* Strategy cards — 2×2 grid */}
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {STRATEGY_CARDS.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => { setSelected(card.key); setSelectedTplId(null) }}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-lg border p-3.5 text-left transition-all",
                  selected === card.key
                    ? "border-primary bg-blue-50/50 ring-1 ring-primary/20"
                    : "border-border hover:border-slate-300 hover:bg-slate-50/50"
                )}
              >
                <div className="text-slate-500">{card.icon}</div>
                <p className="text-[14px] font-medium leading-tight">{card.title}</p>
                <p className="text-[12px] text-slate-500 leading-snug">{card.desc}</p>
                <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border absolute top-3 right-3", card.badgeColor)}>
                  {card.badge}
                </span>
              </button>
            ))}
          </div>

          {/* Template selector — shown when a template strategy is selected */}
          {needsTemplate && (
            <div className="mt-4">
              {loadingTpl ? (
                <div className="shimmer-bar h-10 w-full rounded-lg" />
              ) : templates.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[13px] text-amber-800">No hay plantillas guardadas</p>
                  <p className="text-[12px] text-amber-700 mt-0.5">
                    Guarda una desde el calendario o ve a{" "}
                    <a href="/lab" className="underline font-medium">Configuración → Plantillas</a>
                  </p>
                </div>
              ) : (
                <select
                  value={selectedTplId ?? ""}
                  onChange={(e) => setSelectedTplId(e.target.value || null)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                >
                  <option value="">Seleccionar plantilla...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.assignments.length} asignaciones)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#CCDDEE] shrink-0 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>{tc("cancel")}</Button>
          <Button
            size="sm"
            disabled={!canGenerate}
            onClick={() => { if (selected) onGenerate(selected, selectedTplId ?? undefined) }}
          >
            Generar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Save template modal ──────────────────────────────────────────────────────

function SaveTemplateModal({ open, weekStart, onClose, onSaved }: {
  open: boolean; weekStart: string; onClose: () => void; onSaved: () => void
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setName("") }, [open])

  if (!open) return null

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const result = await saveAsTemplate(weekStart, name.trim())
    setSaving(false)
    if (result.error) { toast.error(result.error); return }
    toast.success(t("templateSaved"))
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-[#CCDDEE] shadow-xl w-[380px] p-5">
        <p className="text-[14px] font-medium mb-3">{t("saveAsTemplate")}</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
          placeholder={t("templateName")}
          className="w-full rounded-lg border border-border px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>{tc("cancel")}</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>{t("save")}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Apply template modal ─────────────────────────────────────────────────────

function ApplyTemplateModal({ open, weekStart, onClose, onApplied }: {
  open: boolean; weekStart: string; onClose: () => void; onApplied: () => void
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale() as "es" | "en"
  const [templates, setTemplates] = useState<RotaTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getTemplates().then((d) => { setTemplates(d); setLoading(false) })
  }, [open])

  if (!open) return null

  async function handleApply(id: string) {
    setApplying(id)
    const result = await applyTemplate(id, weekStart)
    setApplying(null)
    if (result.error) { toast.error(result.error); return }
    if (result.skipped && result.skipped.length > 0) {
      toast.info(t("templateAppliedSkipped", { count: result.skipped.length }))
    } else {
      toast.success(t("templateApplied"))
    }
    onApplied()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-[#CCDDEE] shadow-xl w-[440px] max-h-[70vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#CCDDEE] shrink-0">
          <p className="text-[14px] font-medium">{t("applyTemplate")}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => <div key={i} className="shimmer-bar h-16 w-full rounded-lg" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[14px] font-medium text-slate-500">{t("noTemplates")}</p>
              <p className="text-[13px] text-muted-foreground mt-1">{t("noTemplatesDescription")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-lg border border-border p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors cursor-pointer flex items-center justify-between"
                  onClick={() => handleApply(tpl.id)}
                >
                  <div>
                    <p className="text-[13px] font-medium">{tpl.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {tpl.assignments.length} {t("assignments")} · {formatDate(tpl.created_at, locale)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={applying === tpl.id}
                    onClick={(e) => { e.stopPropagation(); handleApply(tpl.id) }}
                  >
                    {applying === tpl.id ? "…" : t("apply")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#CCDDEE] shrink-0 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>{tc("cancel")}</Button>
        </div>
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
  const [compact, setCompact] = useState(false)
  const [currentDate, setCurrentDate]   = useState(TODAY)
  const [weekData, setWeekData]         = useState<RotaWeekData | null>(null)
  const [monthSummary, setMonthSummary] = useState<RotaMonthSummary | null>(null)
  const [loadingWeek, setLoadingWeek]   = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [isPending, startTransition]    = useTransition()

  // Staff for assignment sheet
  const [staffList, setStaffList] = useState<StaffWithSkills[]>([])

  // Day edit sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDate, setSheetDate] = useState<string | null>(null)

  // Staff profile panel state
  const [profileOpen, setProfileOpen]       = useState(false)
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null)
  const [saveTemplateOpen, setSaveTemplateOpen]   = useState(false)
  const [liveDays, setLiveDays] = useState<RotaDay[] | null>(null)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)

  function openProfile(staffId: string) {
    setProfileStaffId(staffId)
    setProfileOpen(true)
  }

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
    setShowStrategyModal(false)
    if (view === "week")  setCurrentDate((d) => addDays(d, dir * 7))
    else                  setCurrentDate((d) => addMonths(d, dir))
  }

  function goToToday() {
    setCurrentDate(TODAY)
    setShowStrategyModal(false)
  }

  // Generate / publish / unlock
  function handleGenerateClick() {
    setShowStrategyModal(true)
  }

  function handleStrategyGenerate(strategy: GenerationStrategy, templateId?: string) {
    setShowStrategyModal(false)
    startTransition(async () => {
      try {
        if (strategy === "manual") {
          const result = await clearWeek(weekStart)
          if (result.error) { toast.error(result.error); return }
          fetchWeek(weekStart)
          return
        }
        if ((strategy === "strict_template" || strategy === "flexible_template") && templateId) {
          const result = await applyTemplate(templateId, weekStart, strategy === "strict_template")
          if (result.error) { toast.error(result.error); return }
          if (result.skipped && result.skipped.length > 0) {
            toast.info(t("templateAppliedSkipped", { count: result.skipped.length }))
          } else {
            toast.success(t("templateApplied"))
          }
          fetchWeek(weekStart)
          return
        }
        // ai_optimal — run the engine
        const result = await generateRota(weekStart, false, "ai_optimal")
        if (result.error) {
          setError(result.error)
          toast.error(result.error)
        } else {
          fetchWeek(weekStart)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error generando la guardia."
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


  function handleMonthDayClick(date: string) {
    setCurrentDate(date)   // ensures correct week is loaded for the AssignmentSheet
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

  const rota           = weekData?.rota ?? null
  const isPublished    = rota?.status === "published"
  const isDraft        = rota?.status === "draft"
  const hasAssignments = weekData?.days.some((d) => d.assignments.length > 0) ?? false
  const hasSkillGaps   = hasAssignments && (weekData?.days.some((d) => d.skillGaps.length > 0) ?? false)
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null
  const showActions    = true

  const sheetDay = sheetDate ? (weekData?.days.find((d) => d.date === sheetDate) ?? null) : null


  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Desktop toolbar — LEFT · CENTRE (absolute) · RIGHT */}
      <div className="hidden md:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background relative">

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

        {/* CENTRE — absolutely positioned so it stays centred regardless of left/right width */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(["week", "month"] as ViewMode[]).map((v) => (
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

        {/* RIGHT: warnings · generate · overflow ··· */}
        <div className="flex items-center gap-2 shrink-0">
          {weekData && (
            <WarningsPill days={weekData.days} />
          )}
          {showActions && !isPublished && (
            <Button size="sm" onClick={handleGenerateClick} disabled={isPending || loadingWeek}>
              {isPending ? tc("generating") : t("generateRota")}
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
              ...(view === "week" && calendarLayout === "shift" ? [{
                label: compact ? "Vista normal" : "Vista compacta",
                icon: <Rows3 className="size-3.5" />,
                onClick: () => setCompact((c) => !c),
              }] : []),
              ...(hasAssignments && !isPublished ? [{
                label: t("saveAsTemplate"),
                icon: <BookmarkPlus className="size-3.5" />,
                onClick: () => setSaveTemplateOpen(true),
              }] : []),
              {
                label: t("applyTemplate"),
                icon: <BookmarkCheck className="size-3.5" />,
                onClick: () => setApplyTemplateOpen(true),
              },
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
            {isPending ? tc("generating") : t("generateRota")}
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
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* Week view */}
        {view === "week" && (
          <div className="hidden md:flex flex-col flex-1 min-h-0 px-4 py-2 pb-12 gap-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
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
                  onCellClick={() => {}}
                  onChipClick={(a) => openProfile(a.staff_id)}
                  isPublished={!!isPublished}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={handlePunctionsChange}
                  onRefresh={() => fetchWeekSilent(weekStart)}
                  weekStart={weekStart}
                  compact={compact}
                  onDateClick={handleMonthDayClick}
                  onLocalDaysChange={setLiveDays}
                />
              ) : (
                <PersonGrid
                  data={weekData}
                  staffList={staffList}
                  loading={loadingWeek || isPending}
                  isGenerating={isPending}
                  locale={locale}
                  isPublished={!!isPublished}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onChipClick={(a) => openProfile(a.staff_id)}
                  onDateClick={handleMonthDayClick}
                />
              )}
            </div>
          </div>
        )}

        {/* Month view */}
        {view === "month" && (
          <div className="hidden md:block overflow-auto flex-1 px-4 py-3 pb-14">
            <MonthGrid
              summary={monthSummary}
              loading={loadingMonth}
              locale={locale}
              currentDate={currentDate}
              onSelectDay={handleMonthDayClick}
              onSelectWeek={(ws) => { setCurrentDate(ws); setView("week") }}
            />
          </div>
        )}

        {/* Day view */}
        <div className="flex flex-col gap-4 overflow-auto px-4 py-3 md:hidden">
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
        onLeaveStaffIds={sheetDate ? (weekData?.onLeaveByDate[sheetDate] ?? []) : []}
        shiftTimes={weekData?.shiftTimes ?? null}
        shiftTypes={weekData?.shiftTypes ?? []}
        tecnicas={weekData?.tecnicas ?? []}
        punctionsDefault={sheetDate ? (weekData?.punctionsDefault[sheetDate] ?? 0) : 0}
        punctionsOverride={punctionsOverride}
        rota={weekData?.rota ?? null}
        isPublished={!!isPublished}
        onSaved={() => { fetchWeek(weekStart); if (view === "month") fetchMonth(monthStart) }}
        onPunctionsChange={handlePunctionsChange}
      />

      {/* Staff profile panel */}
      <StaffProfilePanel
        staffId={profileStaffId}
        staffList={staffList}
        weekData={weekData}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />

      {/* Bottom taskbar */}
      {view === "week" && weekData && (
        <ShiftBudgetBar
          data={weekData}
          staffList={staffList}
          weekLabel={formatToolbarLabel("week", currentDate, weekStart, locale)}
          onPillClick={openProfile}
          liveDays={liveDays}
        />
      )}
      {view === "month" && monthSummary && (
        <MonthBudgetBar
          summary={monthSummary}
          monthLabel={formatToolbarLabel("month", currentDate, weekStart, locale)}
          onPillClick={openProfile}
        />
      )}

      {/* Generation strategy modal */}
      <GenerationStrategyModal
        open={showStrategyModal}
        weekStart={weekStart}
        weekLabel={formatToolbarLabel("week", currentDate, weekStart, locale)}
        onClose={() => setShowStrategyModal(false)}
        onGenerate={handleStrategyGenerate}
      />

      {/* Template modals */}
      <SaveTemplateModal
        open={saveTemplateOpen}
        weekStart={weekStart}
        onClose={() => setSaveTemplateOpen(false)}
        onSaved={() => {}}
      />
      <ApplyTemplateModal
        open={applyTemplateOpen}
        weekStart={weekStart}
        onClose={() => setApplyTemplateOpen(false)}
        onApplied={() => { fetchWeek(weekStart); if (view === "month") fetchMonth(monthStart) }}
      />
    </main>
  )
}
