"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, Fragment } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { useCanEdit } from "@/lib/role-context"
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Lock, FileDown, FileText, Sheet, CalendarX, MoreHorizontal, X, UserCog, CalendarPlus, Mail, Rows3, BookmarkPlus, BookmarkCheck, Sparkles, Grid3X3, BookmarkX, Bookmark, Briefcase, CheckCircle2, Hourglass, Filter, Plane, Trash2, Pencil, Users, Clock, Cross, User, GraduationCap, Baby, Share, Copy, Star } from "lucide-react"
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
  regenerateDay,
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
  copyPreviousWeek,
} from "@/app/(clinic)/rota/actions"
import type { RotaTemplate } from "@/lib/types/database"
import { formatDate, formatDateRange, formatDateWithYear } from "@/lib/format-date"
import { formatTime } from "@/lib/format-time"
import { AssignmentSheet } from "@/components/assignment-sheet"
import { quickCreateLeave } from "@/app/(clinic)/leaves/actions"
import { WeeklyStrip } from "@/components/weekly-strip"
import { MobileEditToolbar } from "@/components/mobile-edit-toolbar"
import { MobileAddStaffSheet } from "@/components/mobile-add-staff-sheet"
import { MobileTaskView } from "@/components/mobile-task-view"
import { MobileTaskDayView } from "@/components/mobile-task-day-view"
import { TapPopover } from "@/components/tap-popover"
import { MobilePersonView } from "@/components/mobile-person-view"
import { TransposedShiftGrid } from "@/components/transposed-shift-grid"
import { TransposedTaskGrid } from "@/components/transposed-task-grid"
import { RotaHistoryPanel } from "@/components/rota-history-panel"
import { MySchedule } from "@/components/my-schedule"
import { useViewerStaffId } from "@/lib/role-context"
import { TaskGrid } from "@/components/task-grid"
import { StaffHoverProvider, useStaffHover } from "@/components/staff-hover-context"
import { WeekNotes } from "@/components/week-notes"
import type { StaffWithSkills, ShiftType, ShiftTypeDefinition, Tecnica } from "@/lib/types/database"

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode      = "week" | "month"
type CalendarLayout = "shift" | "person"
type Assignment    = RotaDay["assignments"][0]

// ── Constants ─────────────────────────────────────────────────────────────────

import { DEFAULT_DEPT_BORDER, DEFAULT_DEPT_LABEL, DEFAULT_DEPT_ORDER } from "@/lib/department-colors"

type DeptMaps = { border: Record<string, string>; label: Record<string, string>; order: Record<string, number> }

const DEFAULT_DEPT_MAPS: DeptMaps = {
  border: DEFAULT_DEPT_BORDER,
  label:  DEFAULT_DEPT_LABEL,
  order:  DEFAULT_DEPT_ORDER,
}

function buildDeptMaps(departments: import("@/lib/types/database").Department[]): DeptMaps {
  if (!departments || departments.length === 0) return DEFAULT_DEPT_MAPS
  return {
    border: Object.fromEntries(departments.map((d) => [d.code, d.colour])),
    label:  Object.fromEntries(departments.map((d) => [d.code, d.name])),
    order:  Object.fromEntries(departments.map((d) => [d.code, d.sort_order])),
  }
}

// Top-level fallbacks for components that don't have access to weekData
const ROLE_ORDER: Record<string, number> = DEFAULT_DEPT_MAPS.order
const ROLE_LABEL: Record<string, string> = DEFAULT_DEPT_MAPS.label
const ROLE_BORDER: Record<string, string> = DEFAULT_DEPT_MAPS.border

// Kept for month grid role dots (tiny preview)
const ROLE_DOT: Record<string, string> = {
  lab: "bg-blue-400", andrology: "bg-emerald-400", admin: "bg-slate-400",
}
const SHIFT_ORDER: Record<string, number> = { am: 0, pm: 1, full: 2 }

// Técnica pill color classes keyed by color name (matches tecnicas-tab.tsx)
const TECNICA_PILL: Record<string, string> = {
  amber:  "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
  blue:   "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
  green:  "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
  purple: "bg-purple-500/10 border-purple-500/30 text-muted-foreground",
  coral:  "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
  teal:   "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400",
  slate:  "bg-muted border-border text-muted-foreground",
  red:    "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
}

function sortAssignments<T extends { staff: { role: string }; shift_type: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const rd = (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
    if (rd !== 0) return rd
    return (SHIFT_ORDER[a.shift_type] ?? 9) - (SHIFT_ORDER[b.shift_type] ?? 9)
  })
}

const TODAY = new Date().toISOString().split("T")[0]

// ── Skill display — look up técnica name, fallback to code ───────────────────
const LEGACY_SKILL_NAMES: Record<string, string> = {
  biopsy: "Biopsia", icsi: "ICSI", egg_collection: "Recogida de óvulos",
  embryo_transfer: "Transferencia embrionaria", denudation: "Denudación",
  semen_analysis: "Análisis seminal", sperm_prep: "Preparación espermática",
  sperm_freezing: "Congelación de esperma",
}
function makeSkillLabel(tecnicas: Tecnica[]) {
  const codeMap = Object.fromEntries(tecnicas.map((t) => [t.codigo, t.nombre_es]))
  return (code: string) => codeMap[code] ?? LEGACY_SKILL_NAMES[code] ?? code
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
    const start = new Date(weekStart + "T12:00:00")
    const end = new Date(weekStart + "T12:00:00")
    end.setDate(start.getDate() + 27)
    // Compact: "23 mar – 19 abr 2026"
    const sDay = start.getDate()
    const eDay = end.getDate()
    const sMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(start)
    const eMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(end)
    const yr = end.getFullYear()
    return sMon === eMon ? `${sDay}–${eDay} ${sMon} ${yr}` : `${sDay} ${sMon} – ${eDay} ${eMon} ${yr}`
  }
  // week — compact: "23–29 mar 2026"
  const start = new Date(weekStart + "T12:00:00")
  const end = new Date(weekStart + "T12:00:00")
  end.setDate(start.getDate() + 6)
  const sDay = start.getDate()
  const eDay = end.getDate()
  const sMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(start)
  const eMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(end)
  const yr = end.getFullYear()
  return sMon === eMon ? `${sDay}–${eDay} ${sMon} ${yr}` : `${sDay} ${sMon} – ${eDay} ${eMon} ${yr}`
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
        "flex flex-col py-1 text-[12px] select-none bg-background text-foreground border border-border",
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
  first: string; last: string; role: string; isOverride: boolean; readOnly?: boolean
  functionLabel?: string | null
  tecnica?: Tecnica | null
  compact?: boolean
  borderColor?: string
  isTrainingTecnica?: boolean
  colorChips?: boolean
  staffId?: string
  staffColor?: string
  departments?: import("@/lib/types/database").Department[]
}

function ShiftBadge({ first, last, role, isOverride, functionLabel, tecnica, compact = false, borderColor, isTrainingTecnica, colorChips = true, readOnly, staffId, staffColor, departments = [] }: ShiftBadgeProps) {
  const { hoveredStaffId, setHovered } = useStaffHover()
  // Resolve department code to abbreviation for pill display
  const deptMatch = functionLabel ? departments.find((d) => d.code === functionLabel) : null
  const pillLabel = tecnica ? tecnica.codigo : (deptMatch ? deptMatch.abbreviation : (functionLabel ?? null))
  const pillColor = !colorChips
    ? "bg-slate-100 border-border text-muted-foreground"
    : tecnica
    ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : deptMatch
    ? null // use inline style for dept color
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-muted border-border text-muted-foreground"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null
  const deptPillStyle = deptMatch ? { backgroundColor: `${deptMatch.colour}15`, borderColor: `${deptMatch.colour}40`, color: deptMatch.colour } : undefined

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded border border-border font-medium w-full bg-background text-foreground transition-colors duration-150",
        compact ? "py-0.5 px-1.5 min-h-[24px] text-[11px]" : "py-1 px-2 min-h-[28px] text-[13px]",
      )}
      style={{
        borderLeft: colorChips ? undefined : `3px solid ${borderColor ?? DEFAULT_DEPT_MAPS.border[role] ?? "#94A3B8"}`,
        borderRadius: 4,
        ...(staffId && hoveredStaffId === staffId && staffColor ? { backgroundColor: staffColor, color: "#1e293b" } : {}),
      }}
      onMouseEnter={() => staffId && setHovered(staffId)}
      onMouseLeave={() => staffId && setHovered(null)}
    >
      <span className="truncate">{first} {last[0]}.</span>
      {pillLabel && (pillColor || deptPillStyle) ? (
        <span
          className={cn("font-semibold px-1 py-0.5 rounded border ml-auto shrink-0 inline-flex items-center gap-0.5", compact ? "text-[8px]" : "text-[9px]", pillColor)}
          style={deptPillStyle}
        >
          {isTrainingTecnica && <Hourglass className="size-2 text-amber-500" />}
          {pillLabel}
        </span>
      ) : !readOnly ? (
        <span className="text-[9px] font-medium text-muted-foreground/40 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
          + Task
        </span>
      ) : null}
    </div>
  )
}

// Maps department to role for técnica filtering
const DEPT_FOR_ROLE: Record<string, string> = { lab: "lab", andrology: "andrology" }

// ── Assignment popover (función + técnica in one) ─────────────────────────────

function AssignmentPopover({ assignment, staffSkills, tecnicas, departments = [], onFunctionSave, isPublished, disabled, children }: {
  assignment: { id: string; staff: { role: string }; function_label: string | null }
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  departments?: import("@/lib/types/database").Department[]
  onFunctionSave: (id: string, label: string | null) => void
  isPublished: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  // When disabled, just render children without any popover
  if (disabled) return <>{children}</>

  const t = useTranslations("schedule")
  const tStaff = useTranslations("staff")
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean }>({ top: 0, left: 0, flipUp: false })

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (popupRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Calculate position when opening
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popupHeight = 200 // approximate
    const spaceBelow = window.innerHeight - rect.bottom
    const flipUp = spaceBelow < popupHeight && rect.top > popupHeight
    setPos({
      top: flipUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      flipUp,
    })
  }, [open])

  const currentLabel = assignment.function_label ?? null
  const staffSkillCodes = new Set(staffSkills.map((s) => s.skill))
  const staffDept = DEPT_FOR_ROLE[assignment.staff.role]

  const availableTecnicas = tecnicas.filter((t) =>
    t.activa && t.department === staffDept && staffSkillCodes.has(t.codigo)
  )

  // Sub-departments for the staff member's role department
  const roleDept = departments.find((d) => d.parent_id == null && d.code === assignment.staff.role)
  const roleSubDepts = roleDept ? departments.filter((d) => d.parent_id === roleDept.id) : []

  if ((availableTecnicas.length === 0 && roleSubDepts.length === 0) || isPublished) return <>{children}</>

  return (
    <div ref={triggerRef}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className="cursor-pointer">
        {children}
      </div>
      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[100] bg-background border border-border rounded-lg shadow-xl py-1.5 w-52"
          style={{
            left: pos.left,
            ...(pos.flipUp
              ? { bottom: window.innerHeight - pos.top }
              : { top: pos.top }),
          }}
        >
          <p className="text-[11px] font-semibold px-2.5 mb-1">{t("editAssignment")}</p>
          {/* Sub-departments for staff's role */}
          {roleSubDepts.length > 0 && (
            <>
              <p className="text-[10px] text-muted-foreground font-medium mb-1 px-2.5">{tStaff("fields.role")}</p>
              <div className="flex flex-col">
                {roleSubDepts.map((dept) => {
                  const isActive = currentLabel === dept.code
                  return (
                    <button
                      key={dept.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onFunctionSave(assignment.id, isActive ? null : dept.code)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-muted"
                      )}
                    >
                      <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: dept.colour }} />
                      <span className={cn("text-[12px] truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{dept.name}</span>
                      {isActive && <span className="ml-auto text-[10px] text-primary">✓</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {/* Tareas section — techniques the staff member is qualified for */}
          {availableTecnicas.length > 0 && (
            <>
              <div className="h-px bg-border mx-2 my-1" />
              <p className="text-[10px] text-muted-foreground font-medium mb-1 px-2.5">{t("tasks")}</p>
              <div className="flex flex-col">
                {availableTecnicas.map((tec) => {
                  const isActive = currentLabel === tec.codigo
                  const isTraining = staffSkills.find((s) => s.skill === tec.codigo)?.level === "training"
                  const pillColor = TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue
                  return (
                    <button
                      key={tec.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onFunctionSave(assignment.id, isActive ? null : tec.codigo)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-muted"
                      )}
                    >
                      <span className={cn(
                        "text-[10px] font-semibold py-0.5 rounded border shrink-0 w-9 text-center inline-flex items-center justify-center",
                        pillColor,
                        isActive && "ring-1 ring-offset-1 ring-current"
                      )}>
                        {isTraining && <Hourglass className="size-2 text-amber-500 inline mr-0.5" />}
                        {tec.codigo}
                      </span>
                      <span className={cn("text-[12px] truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{tec.nombre_es}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Day stats (punciones + biopsy forecast) ──────────────────────────────────

function DayStatsInput({ date, value, defaultValue, isOverride, onChange, disabled, biopsyForecast, biopsyTooltip }: {
  date: string; value: number; defaultValue: number; isOverride: boolean
  onChange: (date: string, value: number | null) => void; disabled: boolean
  biopsyForecast: number; biopsyTooltip: string
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [biopsyDraft, setBiopsyDraft] = useState(String(biopsyForecast))
  const popRef            = useRef<HTMLDivElement>(null)

  useEffect(() => { setDraft(String(value)) }, [value])
  useEffect(() => { setBiopsyDraft(String(biopsyForecast)) }, [biopsyForecast])

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

  const pLabel = `P:${value}`
  const bLabel = biopsyForecast > 0 ? `B:${biopsyForecast}` : "B:0"

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <span className="flex items-center gap-1 text-[11px] font-medium tabular-nums text-muted-foreground cursor-default">
            <span className={isOverride ? "text-primary" : "text-foreground/70"}>{pLabel}</span>
            <span className="text-foreground/70">{bLabel}</span>
          </span>
        } />
        <TooltipContent side="bottom">
          {biopsyForecast > 0 ? biopsyTooltip : t("punctionsLabel", { count: value })}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div ref={popRef} className="relative">
      <Tooltip>
        <TooltipTrigger render={
          <button
            onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setOpen((o) => !o) }}
            className="flex items-center gap-1 text-[11px] font-medium tabular-nums rounded px-1 py-0.5 transition-colors hover:bg-muted cursor-pointer"
          >
            <span className={isOverride ? "text-primary" : "text-muted-foreground"}>{pLabel}</span>
            <span className="text-muted-foreground">{bLabel}</span>
          </button>
        } />
        {!open && (
          <TooltipContent side="bottom">
            {t("clickToEdit")}{isOverride ? ` · Default: ${defaultValue}` : ""}
          </TooltipContent>
        )}
      </Tooltip>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2.5 w-44 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
            <span className="text-[11px] text-muted-foreground text-right">{t("punctions")}</span>
            <input
              autoFocus
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setOpen(false); setDraft(String(value)) } }}
              className="w-12 text-[12px] text-center border border-input rounded px-1 py-0.5 outline-none focus:border-primary bg-background"
            />
            <span className="text-[11px] text-muted-foreground text-right">{t("biopsies")}</span>
            <input
              type="number"
              min={0}
              value={biopsyDraft}
              onChange={(e) => setBiopsyDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save() }}
              className="w-12 text-[12px] text-center border border-input rounded px-1 py-0.5 outline-none focus:border-primary bg-background"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={save}
              className="flex-1 text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 hover:opacity-90 transition-opacity"
            >
              {tc("save")}
            </button>
            {isOverride && (
              <button
                onClick={reset}
                className="flex-1 text-[11px] text-muted-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors"
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

type MenuItem = { label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean; dividerBefore?: boolean; destructive?: boolean; active?: boolean }

function OverflowMenu({ items }: { items: MenuItem[] }) {
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
      <Button variant="outline" size="icon-sm" onClick={() => setOpen((o) => !o)} aria-label="More options">
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1">
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.dividerBefore && <div className="h-px bg-border my-1" />}
              <button
                onClick={() => { item.onClick(); if (!item.active && item.active !== false) setOpen(false) }}
                disabled={item.disabled}
                className={cn(
                  "flex items-center gap-2 w-full px-4 py-2 text-[14px] text-left transition-colors duration-75 disabled:opacity-50",
                  item.destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent"
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.active && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Staff profile panel ───────────────────────────────────────────────────────

function InlineLeaveForm({ staffId, onCreated }: { staffId: string | null; onCreated: () => void }) {
  const t = useTranslations("schedule")
  const tl = useTranslations("leaves")
  const tc = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState("annual")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [notes, setNotes] = useState("")

  function reset() {
    setType("annual")
    setStartDate("")
    setEndDate("")
    setNotes("")
    setOpen(false)
  }

  function handleSubmit() {
    if (!staffId || !startDate || !endDate) return
    startTransition(async () => {
      const result = await quickCreateLeave({ staffId, type, startDate, endDate, notes })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("leaveRecorded"))
        reset()
        onCreated()
      }
    })
  }

  if (!open) {
    return (
      <div className="px-5 py-2 border-t border-border">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-[12px] text-primary hover:underline"
        >
          <CalendarPlus className="size-3.5" />
          {tl("addLeave")}
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 py-3 border-t border-border flex flex-col gap-2">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t("newLeave")}</p>
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none w-full"
      >
        <option value="annual">{tl("types.annual")}</option>
        <option value="sick">{tl("types.sick")}</option>
        <option value="personal">{tl("types.personal")}</option>
        <option value="training">{tl("types.training")}</option>
        <option value="maternity">{tl("types.maternity")}</option>
        <option value="other">{tl("types.other")}</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value) }}
          className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate}
          className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none"
        />
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("notesOptional")}
        className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none w-full"
      />
      <div className="flex items-center gap-2 mt-1">
        <Button size="sm" onClick={handleSubmit} disabled={isPending || !startDate || !endDate} className="text-[12px] h-7">
          {isPending ? tc("saving") : tc("save")}
        </Button>
        <button onClick={reset} className="text-[12px] text-muted-foreground hover:underline">
          {tc("cancel")}
        </button>
      </div>
    </div>
  )
}

const DAY_ES_2: Record<string, string> = { mon: "Lu", tue: "Ma", wed: "Mi", thu: "Ju", fri: "Vi", sat: "Sá", sun: "Do" }

function PersonShiftSelector({ assignment, shiftTimes, shiftTypes, isPublished, onShiftChange, compact, isOff }: {
  assignment: Assignment
  shiftTimes: ShiftTimes | null
  shiftTypes: import("@/lib/types/database").ShiftTypeDefinition[]
  isPublished: boolean
  onShiftChange: (shift: string) => void
  compact?: boolean
  isOff?: boolean
}) {
  const [open, setOpen] = useState(false)
  const trigRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (trigRef.current?.contains(e.target as Node)) return
      if (dropRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  useEffect(() => {
    if (!open || !trigRef.current) return
    const rect = trigRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 2, left: rect.left })
  }, [open])

  const time = shiftTimes?.[assignment.shift_type]
  const activeShifts = shiftTypes.filter((st) => st.active !== false)

  return (
    <div ref={trigRef} className="w-full">
      <div
        onClick={isPublished ? undefined : () => setOpen((v) => !v)}
        className={cn("w-full rounded select-none flex items-center px-1.5", compact ? "py-0.5 min-h-[24px]" : "py-1.5 min-h-[36px]", !isPublished && "cursor-pointer hover:bg-muted/50", isOff && "justify-center")}
      >
        {isOff ? (
          <span className="text-[12px] text-muted-foreground font-semibold">OFF</span>
        ) : compact ? (
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] font-semibold" style={{ color: "#2C3E6B" }}>{assignment.shift_type}</span>
            {time && <span className="text-[10px] text-muted-foreground tabular-nums">{time.start}–{time.end}</span>}
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            <span className="text-[13px] font-semibold" style={{ color: "#2C3E6B" }}>{assignment.shift_type}</span>
            {time && <span className="text-[10px] text-muted-foreground tabular-nums leading-tight">{time.start}–{time.end}</span>}
          </div>
        )}
      </div>
      {open && createPortal(
        <div ref={dropRef} className="fixed z-[9999] w-36 rounded-lg border border-border bg-background shadow-lg py-1" style={{ top: pos.top, left: pos.left }}>
          {activeShifts.map((st) => (
            <button
              key={st.code}
              onClick={() => { onShiftChange(st.code); setOpen(false) }}
              className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors", st.code === assignment.shift_type && "font-semibold text-primary bg-primary/5")}
            >
              <span className="w-4 shrink-0">{st.code === assignment.shift_type ? "✓" : ""}</span>
              <span>{st.code}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{st.start_time}–{st.end_time}</span>
            </button>
          ))}
          <div className="h-px bg-border mx-2 my-1" />
          <button
            onClick={() => {
              // Remove assignment — set to OFF
              onShiftChange("")
              setOpen(false)
            }}
            className="flex items-center w-full px-3 py-1.5 text-[13px] text-left text-muted-foreground hover:bg-accent transition-colors font-medium"
          >
            OFF
          </button>
        </div>,
        document.body
      )}
    </div>
  )
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
  const t         = useTranslations("schedule")
  const tStaff    = useTranslations("staff")
  const tl        = useTranslations("leaves")
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
  const deptMaps = buildDeptMaps(weekData?.departments ?? [])
  const ROLE_LABEL = deptMaps.label
  const ROLE_BORDER = deptMaps.border

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
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}

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
                <div className="flex items-center gap-1.5">
                  <p className="text-[14px] font-medium truncate">{staff.first_name} {staff.last_name}</p>
                  {(() => {
                    const deptTecs = (weekData?.tecnicas ?? []).filter((tc) => tc.activa && tc.department === staff.role)
                    const certCodes = new Set(staff.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill))
                    const allCertified = staff.role !== "admin" && deptTecs.length > 0 && deptTecs.every((tc) => certCodes.has(tc.codigo))
                    return allCertified ? (
                      <Tooltip>
                        <TooltipTrigger render={<Star className="size-3.5 text-amber-400 fill-amber-400 shrink-0" />} />
                        <TooltipContent side="right">Todas las técnicas validadas</TooltipContent>
                      </Tooltip>
                    ) : null
                  })()}
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
          <button onClick={onClose} className="size-7 flex items-center justify-center rounded hover:bg-muted shrink-0">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Weekly shift strip — this week's assignments */}
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
          </div>

          {/* Shift debt — last 4 weeks */}
          <div className="px-5 py-3 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{t("debtTitle")}</p>
            {loading ? (
              <div className="shimmer-bar h-6 w-24 rounded" />
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={cn(
                    "text-[24px] font-semibold tabular-nums leading-none",
                    debt < 0 ? "text-amber-600" : debt > 0 ? "text-red-600" : "text-foreground"
                  )}>
                    {last4w}
                  </span>
                  <span className="text-[13px] text-muted-foreground">/ {expected4w} {t("shifts")}</span>
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
            <div className="px-5 py-3 border-b border-border">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">Habilidades</p>
              {staff.staff_skills.length === 0 ? (
                <p className="text-[12px] text-muted-foreground italic">{t("noTecnicas")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {staff.staff_skills.map((sk) => (
                    <Tooltip key={sk.id}>
                      <TooltipTrigger render={
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full border font-medium cursor-default",
                          sk.level === "certified"
                            ? "bg-blue-50 border-blue-200 text-blue-700"
                            : "bg-amber-50 border-amber-200 text-amber-600 dark:text-amber-400"
                        )}>
                          {sk.level === "training" && <Hourglass className="size-2.5 text-amber-500 shrink-0" />}
                          {skillLabel(sk.skill)}
                        </span>
                      } />
                      <TooltipContent side="top">
                        {sk.level === "training" ? t("inTraining") : t("certified")}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Last shifts */}
          <div className="px-5 py-3 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{t("recentShifts")}</p>
            {loading ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="shimmer-bar h-4 w-full rounded" />
                ))}
              </div>
            ) : !data?.recentAssignments.length ? (
              <p className="text-[12px] text-muted-foreground italic">{t("noRecentShifts")}</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {data.recentAssignments.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px] py-0.5">
                    <span className="text-muted-foreground capitalize">{formatDate(a.date, locale)}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-foreground">{a.shift_type}</span>
                      {a.function_label && !a.function_label.startsWith("dept_") && (
                        <span className="text-[9px] px-1 py-0.5 rounded border bg-blue-50 border-blue-200 text-blue-700 font-semibold">{a.function_label}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                  <p className="text-muted-foreground">{tStaff("daysAvailable")}</p>
                  <p className="text-foreground font-medium">{(staff.working_pattern ?? []).map((d) => DAY_ES_2[d] ?? d).join(", ")}</p>
                </div>
                {((staff.preferred_days?.length ?? 0) > 0 || (staff.avoid_days?.length ?? 0) > 0) && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">{t("dayPreferences")}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {(staff.preferred_days ?? []).map((d) => (
                        <span key={d} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#2C3E6B] text-white">{DAY_ES_2[d] ?? d}</span>
                      ))}
                      {(staff.avoid_days ?? []).map((d) => (
                        <span key={d} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C]">{DAY_ES_2[d] ?? d}</span>
                      ))}
                    </div>
                  </div>
                )}
                {staff.preferred_shift && (
                  <div>
                    <p className="text-muted-foreground">{t("preferredShift")}</p>
                    <p className="text-foreground font-medium">{staff.preferred_shift}</p>
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
        <InlineLeaveForm staffId={staffId} onCreated={() => {
          // Re-fetch profile to update leaves
          if (staffId) {
            setLoading(true)
            getStaffProfile(staffId).then((d) => { setData(d); setLoading(false) })
          }
        }} />

        {/* ── Footer: quick actions ────────────────────────────── */}
        <div className="border-t border-border px-5 py-3 shrink-0 flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            className="flex-1 gap-1.5 text-[12px]"
            render={<a href={`/staff/${staffId}`} />}
          >
            <UserCog className="size-3.5" />
            {tStaff("profile")}
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

function ShiftBudgetBar({ data, staffList, weekLabel, onPillClick, liveDays, deptFilter }: {
  data: RotaWeekData; staffList: StaffWithSkills[]; weekLabel: string; onPillClick?: (staffId: string) => void
  liveDays?: RotaDay[] | null; deptFilter?: Set<string>
}) {
  const t = useTranslations("schedule")
  const ROLE_LABEL = buildDeptMaps(data.departments ?? []).label
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)

  const days = liveDays ?? data.days
  const isByTask = data.rotaDisplayMode === "by_task"
  const staffMap: Record<string, { first: string; last: string; role: string; count: number; daysPerWeek: number }> = {}
  const staffDaySeen: Record<string, Set<string>> = {} // staff_id → set of dates (for by_task dedup)

  // Seed all active staff so 0-assignment members appear too
  for (const s of staffList) {
    if (deptFilter && !deptFilter.has(s.role)) continue
    staffMap[s.id] = {
      first: s.first_name, last: s.last_name, role: s.role,
      count: 0, daysPerWeek: s.days_per_week ?? 5,
    }
    staffDaySeen[s.id] = new Set()
  }

  for (const day of days) {
    for (const a of day.assignments) {
      if (deptFilter && !deptFilter.has(a.staff.role)) continue
      // In by_task mode, only count assignments that have a function_label (task assignments)
      if (isByTask && !a.function_label) continue
      if (!staffMap[a.staff_id]) {
        staffMap[a.staff_id] = {
          first: a.staff.first_name, last: a.staff.last_name, role: a.staff.role,
          count: 0, daysPerWeek: 5,
        }
        staffDaySeen[a.staff_id] = new Set()
      }
      if (isByTask) {
        // Count unique days, not individual task assignments
        if (!staffDaySeen[a.staff_id].has(day.date)) {
          staffDaySeen[a.staff_id].add(day.date)
          staffMap[a.staff_id].count++
        }
      } else {
        staffMap[a.staff_id].count++
      }
    }
  }

  const entries = Object.entries(staffMap).sort((a, b) =>
    a[1].first.localeCompare(b[1].first) || a[1].last.localeCompare(b[1].last)
  )

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

  const { hoveredStaffId, setHovered } = useStaffHover()
  const FALLBACK_COLORS = [
    "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
    "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
    "#E9D5FF", "#FEF08A", "#CCFBF1", "#FFE4E6",
  ]
  const staffColorLookup = Object.fromEntries(staffList.map((s, i) => [s.id, s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]]))

  if (entries.length === 0) return null

  const shown    = visibleCount !== null ? entries.slice(0, visibleCount) : entries
  const overflow = visibleCount !== null ? entries.slice(visibleCount) : []

  function renderPill(id: string, s: { first: string; last: string; role: string; count: number; daysPerWeek: number }) {
    const over  = s.count > s.daysPerWeek
    const under = s.count < s.daysPerWeek
    const color = s.count === 0 ? "text-muted-foreground" : over ? "text-red-600" : under ? "text-amber-600" : "text-muted-foreground"
    const isHov = hoveredStaffId === id
    const staffColor = staffColorLookup[id]
    return (
      <Tooltip key={id}>
        <TooltipTrigger render={
          <button
            data-pill
            onClick={() => onPillClick?.(id)}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            className={cn("px-1.5 py-0.5 rounded text-[12px] transition-colors duration-150 cursor-pointer hover:bg-accent flex items-center gap-1", color)}
            style={isHov && staffColor ? { backgroundColor: staffColor, color: "#1e293b" } : undefined}
          >
            {staffColor && <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: isHov ? "#1e293b" : staffColor }} />}
            <span className="font-medium">{s.first[0]}{s.last[0]}</span>{" "}
            <span className="font-normal tabular-nums">{s.count}/{s.daysPerWeek}</span>
          </button>
        } />
        <TooltipContent side="top">
          {s.first} {s.last} · {ROLE_LABEL[s.role] ?? s.role} · {s.count}/{s.daysPerWeek} {t("shifts")}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className="shrink-0 h-11 bg-background border-t border-border flex items-center px-4 gap-1"
    >
      {/* Left: label + pills */}
      <span className="text-[12px] text-muted-foreground font-medium shrink-0 mr-1">{t("shiftBudget")}:</span>
      <div ref={containerRef} className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
        {shown.map(([id, s], i) => (
          <Fragment key={id}>
            {i > 0 && <span className="text-muted-foreground/40 text-[10px] select-none">·</span>}
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
            {t("moreStaff", { count: overflow.length })}
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
    </div>
  )
}

function MonthBudgetBar({ summary, monthLabel, onPillClick }: {
  summary: RotaMonthSummary; monthLabel: string; onPillClick?: (staffId: string) => void
}) {
  const t = useTranslations("schedule")
  const entries = Object.entries(summary.staffTotals).sort((a, b) => {
    return a[1].first.localeCompare(b[1].first) || a[1].last.localeCompare(b[1].last)
  })

  if (entries.length === 0) return null

  // Monthly expected: days_per_week × ~4.33 (weeks in a month)
  const monthDate = new Date(summary.monthStart + "T12:00:00")
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const weeksInMonth = daysInMonth / 7

  return (
    <div
      className="shrink-0 h-11 bg-background border-t border-border flex items-center px-4 gap-1"
    >
      <span className="text-[12px] text-muted-foreground font-medium shrink-0 mr-1">{t("shiftBudget")}:</span>
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
        {entries.map(([id, s], i) => {
          const expected = Math.round(s.daysPerWeek * weeksInMonth)
          const over = s.count > expected
          const color = s.count === 0 ? "text-muted-foreground" : over ? "text-amber-600" : "text-muted-foreground"
          return (
            <Fragment key={id}>
              {i > 0 && <span className="text-muted-foreground/40 text-[10px] select-none">·</span>}
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => onPillClick?.(id)}
                    className={cn("px-1.5 py-0.5 rounded text-[12px] transition-colors cursor-pointer hover:bg-accent", color)}
                  >
                    <span className="font-medium">{s.first[0]}{s.last[0]}</span>{" "}
                    <span className="font-normal tabular-nums">{s.count}/{expected}</span>
                  </button>
                } />
                <TooltipContent side="top">
                  {s.first} {s.last} · {ROLE_LABEL[s.role] ?? s.role} · {s.count}/{expected} {t("shiftsPerMonth")}
                </TooltipContent>
              </Tooltip>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

// ── Skill gap pill ────────────────────────────────────────────────────────────

const WARNING_CATEGORY_KEY: Record<string, string> = {
  coverage: "warningCoverage",
  skill_gap: "warningSkillGap",
  technique_shift_gap: "warningTechniqueShiftGap",
  rule: "warningRule",
  budget: "warningBudget",
}
const WARNING_CATEGORY_ORDER: Record<string, number> = { coverage: 0, skill_gap: 1, technique_shift_gap: 2, budget: 3, rule: 4 }

/** Click-to-open popover for per-day warnings in column headers. */
function DayWarningPopover({ warnings }: { warnings: RotaDayWarning[] }) {
  const t = useTranslations("schedule")
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
                {WARNING_CATEGORY_KEY[cat] ? t(WARNING_CATEGORY_KEY[cat]) : cat}
              </p>
              {groups[cat].map((msg, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">· {msg}</p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Toolbar pill summarising all warnings for the week. Click to expand. */
function WarningsPill({ days, staffList }: { days: RotaDay[]; staffList?: StaffWithSkills[] }) {
  const t = useTranslations("schedule")
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
      if (existing) existing.messages.push(w.message)
      else byCategory[w.category].push({ day: dayLabel, messages: [w.message] })
    }
  }

  // Compute shift budget warnings (over/under for the week)
  if (staffList && staffList.length > 0) {
    const shiftCounts: Record<string, number> = {}
    for (const day of days) {
      for (const a of day.assignments) {
        shiftCounts[a.staff_id] = (shiftCounts[a.staff_id] ?? 0) + 1
      }
    }
    const budgetWarnings: string[] = []
    for (const s of staffList) {
      const count = shiftCounts[s.id] ?? 0
      const expected = s.days_per_week ?? 5
      if (count > expected) budgetWarnings.push(`${s.first_name} ${s.last_name[0]}. ${count}/${expected} (+${count - expected})`)
      else if (count < expected && count > 0) budgetWarnings.push(`${s.first_name} ${s.last_name[0]}. ${count}/${expected} (${count - expected})`)
    }
    if (budgetWarnings.length > 0) {
      if (!byCategory["budget"]) byCategory["budget"] = []
      byCategory["budget"].push({ day: t("weekView"), messages: budgetWarnings })
    }
  }

  const sortedCategories = Object.keys(byCategory).sort(
    (a, b) => (WARNING_CATEGORY_ORDER[a] ?? 9) - (WARNING_CATEGORY_ORDER[b] ?? 9)
  )

  const totalIssues = Object.values(byCategory).reduce((sum, arr) => sum + arr.reduce((s, e) => s + e.messages.length, 0), 0)

  if (totalIssues === 0) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <span className="cursor-default">
            <CheckCircle2 className="size-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
          </span>
        } />
        <TooltipContent side="bottom">{t("noWarnings")}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 h-7 px-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[12px] font-semibold hover:bg-amber-500/20 transition-colors shrink-0"
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        {totalIssues}
      </button>

      {open && (() => {
        const uniqueDays = new Set<string>()
        for (const arr of Object.values(byCategory)) for (const e of arr) uniqueDays.add(e.day)
        const singleDay = uniqueDays.size === 1
        return (
          <div className="absolute right-0 top-full mt-1 z-[200] w-[min(320px,90vw)] rounded-lg border border-border bg-background shadow-lg py-2.5 max-h-[50vh] overflow-y-auto">
            {singleDay && <p className="px-3 pb-1.5 text-[13px] font-medium capitalize">{[...uniqueDays][0]}</p>}
            {sortedCategories.map((cat) => (
              <div key={cat} className="px-3 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  {WARNING_CATEGORY_KEY[cat] ? t(WARNING_CATEGORY_KEY[cat]) : cat}
                </p>
                {byCategory[cat].map(({ day, messages }) => (
                  <div key={day} className="mb-2 last:mb-0">
                    {!singleDay && <p className="text-[13px] font-medium capitalize">{day}</p>}
                    {messages.map((msg, mi) => (
                      <p key={mi} className="text-[12px] text-muted-foreground pl-2 leading-relaxed">· {msg}</p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

// ── Person view (Vista por persona) ───────────────────────────────────────────


function PersonShiftPill({ assignment, shiftTimes, tecnica, onClick, taskDisabled, compact }: {
  assignment: Assignment
  shiftTimes: ShiftTimes | null
  tecnica: Tecnica | null
  onClick?: (e: React.MouseEvent) => void
  taskDisabled?: boolean
  compact?: boolean
}) {
  const { shift_type, is_manual_override, function_label } = assignment
  const time = shiftTimes?.[shift_type]

  const cleanLabel = function_label?.startsWith("dept_") ? null : function_label
  const showTask = !taskDisabled && (tecnica || cleanLabel)
  const pillLabel = tecnica ? tecnica.codigo : cleanLabel
  const pillColor = tecnica
    ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-muted border-border text-muted-foreground"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full rounded select-none flex items-center gap-1.5 px-1.5",
        compact ? "py-0.5 min-h-[24px]" : "py-1.5 min-h-[36px]",
        !onClick ? "cursor-default" : "cursor-pointer hover:bg-muted/50",
      )}
    >
      {compact ? (
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-semibold" style={{ color: "#2C3E6B" }}>{shift_type}</span>
          {time && <span className="text-[10px] text-muted-foreground tabular-nums">{time.start}–{time.end}</span>}
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          <span className="text-[13px] font-semibold" style={{ color: "#2C3E6B" }}>{shift_type}</span>
          {time && <span className="text-[10px] text-muted-foreground tabular-nums leading-tight">{time.start}–{time.end}</span>}
        </div>
      )}
      {showTask && pillLabel && pillColor && (
        <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 ml-auto", pillColor)}>
          {pillLabel}
        </span>
      )}
    </div>
  )
}

function PersonGrid({
  data, staffList, loading, locale,
  isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick, colorChips, punctionsDefault, punctionsOverride, onPunctionsChange, compact,
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
  colorChips?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  compact?: boolean
  onDateClick?: (date: string) => void
  isGenerating?: boolean
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
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
            <div className="h-[52px] border-b border-r border-border" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center py-2 border-b border-r last:border-r-0 border-border gap-1">
                <div className="shimmer-bar h-2.5 w-6" />
                <div className="shimmer-bar w-7 h-7 rounded-full" />
              </div>
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <Fragment key={i}>
                <div className="px-3 py-2.5 border-b border-r border-border">
                  <div className="shimmer-bar h-3 w-28" />
                </div>
                {Array.from({ length: 7 }).map((_, j) => (
                  <div key={j} className="p-1.5 border-b border-r last:border-r-0 border-border min-h-[48px]">
                    <div className={`shimmer-bar h-9 w-full rounded ${j >= 5 ? "opacity-50" : ""}`} />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center py-1">
          <span className="generating-label text-[13px] text-muted-foreground">
            {isGenerating ? tc("generating") : tc("loading")}
          </span>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { label: ROLE_LABEL_MAP, order: ROLE_ORDER_MAP } = buildDeptMaps(data.departments ?? [])

  // Build assignment lookup: staffId → date → assignment
  const assignMap: Record<string, Record<string, Assignment>> = {}
  for (const day of localDays) {
    for (const a of day.assignments) {
      if (!assignMap[a.staff_id]) assignMap[a.staff_id] = {}
      assignMap[a.staff_id][day.date] = a
    }
  }

  // Shift highlighting — hover a shift to highlight all same-shift cells
  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredShift, setHoveredShift] = useState<string | null>(null)

  // Active staff sorted by role then first name
  const activeStaff = staffList
    .filter((s) => s.onboarding_status !== "inactive")
    .sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
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

        {/* Header row — matches by-shift view */}
        <div className="border-r border-b border-border bg-muted sticky left-0 z-10" style={{ minHeight: 52 }} />
        {days.map((day) => {
          const d       = new Date(day.date + "T12:00:00")
          const wday    = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayN    = String(d.getDate())
          const today   = day.date === TODAY
          const holiday = publicHolidays[day.date]
          const isSat   = d.getDay() === 6
          return (
            <div key={day.date} className={cn(
              "relative flex flex-col items-center justify-center py-1.5 gap-[2px] border-b border-r last:border-r-0 border-border",
              holiday ? "bg-amber-50/60" : "bg-muted"
            )}
            style={isSat ? { borderLeft: "1px dashed var(--border)" } : undefined}
            >
              {day.warnings.length > 0 && (
                <DayWarningPopover warnings={day.warnings} />
              )}
              <button
                onClick={() => onDateClick?.(day.date)}
                className={cn("flex flex-col items-center gap-[2px] cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wday}</span>
                <span className={cn(
                  "font-semibold leading-none text-[18px]",
                  today ? "size-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[15px]"
                  : holiday ? "text-amber-600" : "text-primary"
                )}>
                  {dayN}
                </span>
              </button>
              {holiday && (
                <Tooltip>
                  <TooltipTrigger render={<span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>} />
                  <TooltipContent side="bottom">{holiday}</TooltipContent>
                </Tooltip>
              )}
              {day.skillGaps.length > 0 && <AlertTriangle className="size-3 text-amber-500" />}
              {/* Punciones / Biopsias — same component as ShiftGrid */}
              {(() => {
                const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
                function getPunc(dateStr: string): number {
                  if ((punctionsOverride ?? {})[dateStr] !== undefined) return (punctionsOverride ?? {})[dateStr]
                  if ((punctionsDefault ?? {})[dateStr] !== undefined) return (punctionsDefault ?? {})[dateStr]
                  const dow = new Date(dateStr + "T12:00:00").getDay()
                  const sameDow = Object.entries(punctionsDefault ?? {}).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
                  return sameDow ? sameDow[1] : 0
                }
                const pDefault = (punctionsDefault ?? {})[day.date] ?? 0
                const pEffective = (punctionsOverride ?? {})[day.date] ?? pDefault
                const hasOverride = (punctionsOverride ?? {})[day.date] !== undefined
                const bRate = data?.biopsyConversionRate ?? 0.5
                const bD5 = data?.biopsyDay5Pct ?? 0.5
                const bD6 = data?.biopsyDay6Pct ?? 0.5
                const d5ago = new Date(day.date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
                const d6ago = new Date(day.date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
                const p5 = getPunc(d5ago.toISOString().split("T")[0])
                const p6 = getPunc(d6ago.toISOString().split("T")[0])
                const forecast = Math.round(p5 * bRate * bD5 + p6 * bRate * bD6)
                const tooltip = forecast > 0 ? `${forecast} biopsias previstas` : `${pEffective} punciones`
                return (
                  <DayStatsInput
                    date={day.date}
                    value={pEffective}
                    defaultValue={pDefault}
                    isOverride={hasOverride}
                    onChange={onPunctionsChange ?? (() => {})}
                    disabled={!onPunctionsChange}
                    biopsyForecast={forecast}
                    biopsyTooltip={tooltip}
                  />
                )
              })()}
            </div>
          )
        })}

        {/* Role groups */}
        {roleGroups.map(({ role, members }, groupIdx) => (
          <Fragment key={role}>
            {/* Role header — spans all 8 columns */}
            <div
              className="px-3 py-1.5 bg-muted border-b border-border flex items-center gap-1.5"
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
                  {/* Name cell — click opens profile */}
                  <div
                    className="px-3 py-2 border-b border-r border-border bg-background sticky left-0 z-10 flex items-center min-w-0 min-h-[48px] cursor-pointer hover:bg-muted/50"
                    style={colorChips ? { borderLeft: `3px solid ${s.color || "#D4D4D8"}` } : undefined}
                    onClick={() => onChipClick({ staff_id: s.id } as Assignment, "")}
                  >
                    <span className="text-[13px] font-medium truncate leading-tight">
                      {s.first_name} {s.last_name}
                    </span>
                  </div>

                  {/* Day cells */}
                  {days.map((day) => {
                    const assignment = staffAssigns[day.date]
                    const onLeave    = (onLeaveByDate[day.date] ?? []).includes(s.id)
                    const taskOff = data?.rotaDisplayMode === "by_shift" && !data?.enableTaskInShift
                    const cleanFnLabel = assignment?.function_label?.startsWith("dept_") ? null : assignment?.function_label
                    const tecnica    = (taskOff || !assignment) ? null
                      : cleanFnLabel
                        ? (data.tecnicas ?? []).find((t) => t.codigo === cleanFnLabel) ?? null
                        : (data.tecnicas ?? []).find((t) => t.id === assignment.tecnica_id) ?? null
                    const cellShift = assignment ? assignment.shift_type : (onLeave ? "__leave__" : "__off__")
                    const isShiftHovered = highlightEnabled && hoveredShift && cellShift === hoveredShift
                    return (
                      <div
                        key={day.date}
                        className={cn("px-1 py-1 border-b border-r last:border-r-0 border-border min-h-[48px] flex items-center transition-colors duration-100", isShiftHovered ? "bg-blue-100/50" : "bg-background")}
                        onMouseEnter={() => setHoveredShift(cellShift)}
                        onMouseLeave={() => setHoveredShift(null)}
                      >
                        {assignment ? (
                          taskOff ? (
                            <PersonShiftSelector
                              assignment={assignment}
                              shiftTimes={shiftTimes}
                              shiftTypes={data?.shiftTypes ?? []}
                              isPublished={isPublished}
                              compact={compact}
                              onShiftChange={async (newShift) => {
                                if (!newShift) {
                                  patchLocalAssignment(assignment.id, { _removed: true })
                                  setLocalDays((prev) => prev.map((d) => ({
                                    ...d,
                                    assignments: d.assignments.filter((a) => a.id !== assignment.id),
                                  })))
                                  const result = await removeAssignment(assignment.id)
                                  if (result.error) toast.error(result.error)
                                } else {
                                  patchLocalAssignment(assignment.id, { shift_type: newShift })
                                  const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                                  if (result.error) toast.error(result.error)
                                }
                              }}
                            />
                          ) : (
                            <AssignmentPopover
                              assignment={assignment}
                              staffSkills={s.staff_skills ?? []}
                              tecnicas={data?.tecnicas ?? []}
                              departments={data?.departments ?? []}
                              onFunctionSave={handleFunctionLabelSave}
                              isPublished={isPublished}
                            >
                              <div className="w-full">
                                <PersonShiftPill
                                  assignment={assignment}
                                  shiftTimes={shiftTimes}
                                  tecnica={tecnica}
                                />
                              </div>
                            </AssignmentPopover>
                          )
                        ) : onLeave ? (
                          <span className="text-[12px] text-muted-foreground italic w-full text-center">{t("leaveShort")}</span>
                        ) : !isPublished ? (
                          <PersonShiftSelector
                            assignment={{ id: "", shift_type: "", staff_id: s.id, staff: s as any, is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false } as Assignment}
                            shiftTimes={shiftTimes}
                            shiftTypes={data?.shiftTypes ?? []}
                            isPublished={false}
                            compact={compact}
                            isOff
                            onShiftChange={async (newShift) => {
                              if (!newShift) return
                              const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                              if (result.error) toast.error(result.error)
                              else {
                                // Refresh local state
                                setLocalDays((prev) => prev.map((d) => d.date !== day.date ? d : {
                                  ...d,
                                  assignments: [...d.assignments, { id: result.id ?? `temp-${Date.now()}`, staff_id: s.id, staff: s as any, shift_type: newShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false }],
                                }))
                              }
                            }}
                          />
                        ) : (
                          <span className="text-[12px] text-muted-foreground font-semibold select-none w-full text-center">OFF</span>
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

// ── Transposed Person Grid (días como filas) ─────────────────────────────────

function TransposedPersonGrid({
  data, staffList, locale, isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick, colorChips, compact, punctionsDefault, punctionsOverride, onPunctionsChange,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  onChipClick: (assignment: { staff_id: string }, date: string) => void
  onDateClick?: (date: string) => void
  colorChips?: boolean
  compact?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
}) {
  const t = useTranslations("schedule")
  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredShift, setHoveredShift] = useState<string | null>(null)

  if (!data) return null

  const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
  const ROLE_LABEL_MAP: Record<string, string> = {}
  for (const d of data.departments ?? []) { if (!d.parent_id) ROLE_LABEL_MAP[d.code] = d.name }

  const activeStaff = staffList
    .filter((s) => s.onboarding_status !== "inactive")
    .sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
    })

  const [localDays, setLocalDays] = useState(data.days)
  useEffect(() => { setLocalDays(data.days) }, [data])

  // Build assignment map: staffId → date → assignment
  const assignMap: Record<string, Record<string, Assignment>> = {}
  for (const day of localDays) {
    for (const a of day.assignments) {
      if (!assignMap[a.staff_id]) assignMap[a.staff_id] = {}
      assignMap[a.staff_id][day.date] = a
    }
  }

  // Group staff by role for sub-headers
  const roleGroups: { role: string; members: StaffWithSkills[] }[] = []
  for (const s of activeStaff) {
    const last = roleGroups[roleGroups.length - 1]
    if (last && last.role === s.role) last.members.push(s)
    else roleGroups.push({ role: s.role, members: [s] })
  }

  const allMembers = roleGroups.flatMap((g) => g.members)
  const days = localDays

  return (
    <div className="rounded-lg border border-border overflow-auto w-full">
      <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${allMembers.length}, minmax(${compact ? "60px" : "80px"}, 1fr))`, minWidth: allMembers.length * (compact ? 65 : 85) + 80 }}>

        {/* Header: empty corner + staff names */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-20" style={{ minHeight: 48 }} />
        {allMembers.map((s, i) => {
          // Check if this is the first in a new role group
          const prevRole = i > 0 ? allMembers[i - 1].role : null
          const isNewGroup = s.role !== prevRole
          return (
            <div
              key={s.id}
              className={cn(
                "border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1",
                              )}
              style={colorChips ? { borderTop: `3px solid ${s.color || "#D4D4D8"}` } : undefined}
            >
              <button
                onClick={() => onChipClick({ staff_id: s.id }, "")}
                className="flex flex-col items-center cursor-pointer hover:opacity-70 transition-opacity"
              >
                <span className={cn("font-medium text-center leading-tight truncate w-full", compact ? "text-[10px]" : "text-[11px]")}>
                  {s.first_name}
                </span>
                <span className={cn("text-muted-foreground text-center truncate w-full", compact ? "text-[9px]" : "text-[10px]")}>
                  {s.last_name[0]}.
                </span>
              </button>
            </div>
          )
        })}

        {/* Day rows */}
        {days.map((day) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).slice(0, 2).toUpperCase()
          const dayN = String(d.getDate())
          const today = day.date === TODAY
          const holiday = publicHolidays[day.date]
          const isSat = d.getDay() === 6

          return (
            <Fragment key={day.date}>
              {/* Day label cell — click opens day view */}
              <div
                className={cn(
                  "border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center justify-end gap-1.5 px-2 cursor-pointer hover:bg-muted/80",
                  holiday && "bg-amber-50/60"
                )}
                style={isSat ? { borderTop: "1px dashed var(--border)" } : undefined}
                onClick={() => onDateClick?.(day.date)}
              >
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase">{wday}</span>
                  <span className={cn(
                    "font-semibold leading-none",
                    today ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary"
                  )}>
                    {dayN}
                  </span>
                </div>
              </div>

              {/* Staff cells for this day */}
              {allMembers.map((s, i) => {
                const assignment = assignMap[s.id]?.[day.date]
                const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)
                const cellShift = assignment ? assignment.shift_type : (onLeave ? "__leave__" : "__off__")
                const isHovered = highlightEnabled && hoveredShift && cellShift === hoveredShift
                const prevRole = i > 0 ? allMembers[i - 1].role : null
                const isNewGroup = s.role !== prevRole

                return (
                  <div
                    key={s.id}
                    className={cn(
                      "border-b border-r last:border-r-0 border-border flex items-center justify-center transition-colors duration-100",
                      compact ? "min-h-[28px] px-0.5 py-0.5" : "min-h-[36px] px-1 py-1",
                      isHovered ? "bg-blue-100/50" : "bg-background",
                                          )}
                    onMouseEnter={() => setHoveredShift(cellShift)}
                    onMouseLeave={() => setHoveredShift(null)}
                  >
                    {assignment ? (
                      !isPublished ? (
                        <PersonShiftSelector
                          assignment={assignment}
                          shiftTimes={shiftTimes}
                          shiftTypes={data?.shiftTypes ?? []}
                          isPublished={false}
                          compact
                          onShiftChange={async (newShift) => {
                            if (!newShift) {
                              setLocalDays((prev) => prev.map((dd) => ({ ...dd, assignments: dd.assignments.filter((a) => a.id !== assignment.id) })))
                              const result = await removeAssignment(assignment.id)
                              if (result.error) toast.error(result.error)
                            } else {
                              setLocalDays((prev) => prev.map((dd) => ({ ...dd, assignments: dd.assignments.map((a) => a.id === assignment.id ? { ...a, shift_type: newShift } : a) })))
                              const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                              if (result.error) toast.error(result.error)
                            }
                          }}
                        />
                      ) : (
                        <span className={cn("font-semibold tabular-nums", compact ? "text-[10px]" : "text-[12px]")} style={{ color: "#2C3E6B" }}>
                          {assignment.shift_type}
                        </span>
                      )
                    ) : onLeave ? (
                      <span className={cn("text-muted-foreground italic", compact ? "text-[9px]" : "text-[11px]")}>{t("leaveShort")}</span>
                    ) : !isPublished ? (
                      <PersonShiftSelector
                        assignment={{ id: "", shift_type: "", staff_id: s.id, staff: s as any, is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false } as Assignment}
                        shiftTimes={shiftTimes}
                        shiftTypes={data?.shiftTypes ?? []}
                        isPublished={false}
                        compact
                        isOff
                        onShiftChange={async (newShift) => {
                          if (!newShift) return
                          const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                          if (result.error) toast.error(result.error)
                          else {
                            setLocalDays((prev) => prev.map((dd) => dd.date !== day.date ? dd : {
                              ...dd,
                              assignments: [...dd.assignments, { id: `temp-${Date.now()}`, staff_id: s.id, staff: s as any, shift_type: newShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false }],
                            }))
                          }
                        }}
                      />
                    ) : (
                      <span className={cn("text-muted-foreground font-semibold", compact ? "text-[9px]" : "text-[11px]")}>OFF</span>
                    )}
                  </div>
                )
              })}
            </Fragment>
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
  onRefresh, weekStart, compact, colorChips, onDateClick, onLocalDaysChange,
  ratioOptimal, ratioMinimum, timeFormat = "24h",
  biopsyConversionRate = 0.5, biopsyDay5Pct = 0.5, biopsyDay6Pct = 0.5,
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
  colorChips?: boolean
  onDateClick?: (date: string) => void
  onLocalDaysChange?: (days: RotaDay[]) => void
  ratioOptimal?: number
  ratioMinimum?: number
  timeFormat?: string
  biopsyConversionRate?: number
  biopsyDay5Pct?: number
  biopsyDay6Pct?: number
}) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")

  // Staff color map with fallbacks
  const FALLBACK_COLORS_SHIFT = [
    "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
    "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  ]
  const staffColorMap = Object.fromEntries(staffList.map((s, i) => [s.id, s.color || FALLBACK_COLORS_SHIFT[i % FALLBACK_COLORS_SHIFT.length]]))
  const { hoveredStaffId, setHovered } = useStaffHover()

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

  // Debounced refresh — batches rapid changes into one server fetch
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function debouncedRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => { onRefresh(); refreshTimer.current = null }, 800)
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
            shift_type: destShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false,
          }
          return { ...d, assignments: [...d.assignments, optimistic as Assignment] }
        }))
      }

      try {
        const result = await upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift })
        if (result?.error) { toast.error(result.error); onRefresh(); return }
        const newId = result.id
        toast.success(t("shiftAssigned"), {
          action: newId ? {
            label: t("undo"),
            onClick: async () => {
              await removeAssignment(newId)
              onRefresh()
            },
          } : undefined,
        })
      } catch {
        toast.error(t("assignmentError"))
        onRefresh()
        return
      }
      debouncedRefresh()
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
        toast.success(t("shiftRemoved"), {
          action: {
            label: t("undo"),
            onClick: async () => {
              await upsertAssignment({ weekStart, staffId: oldStaff, date: oldDate, shiftType: oldShift })
              onRefresh()
            },
          },
        })
        debouncedRefresh()
      } catch {
        toast.error(t("removeError"))
        onRefresh()
      }
    } else {
      const destDate  = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11)

      if (sourceAssignment.date !== destDate) {
        toast.error(t("shiftMoveError"))
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
        toast.success(t("shiftUpdated"), {
          action: {
            label: t("undo"),
            onClick: async () => {
              await moveAssignmentShift(assignmentId, oldShift)
              onRefresh()
            },
          },
        })
        debouncedRefresh()
      } catch {
        toast.error(t("moveError"))
        onRefresh()
      }
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="rounded-lg border border-border overflow-hidden w-full">
          {/* Header */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border">
            <div className="border-r border-border h-[52px]" />
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
          {/* Rows — enough to cover up to 5 shifts + off */}
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border last:border-b-0">
              <div className="border-r border-border flex items-center justify-end px-2 py-3">
                <div className="shimmer-bar h-3 w-8" />
              </div>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="p-2 flex items-center justify-center min-h-[64px] bg-background">
                  <div className={`shimmer-bar h-5 w-full rounded ${i >= 5 ? "opacity-50" : ""}`} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center py-1">
          <span className="generating-label text-[13px] text-muted-foreground">
            {isGenerating ? tc("generating") : tc("loading")}
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

  // Staff IDs visible based on department filter
  const visibleStaffIds = new Set(staffList.map((s) => s.id))

  // Dynamic department maps from DB
  const deptMaps = buildDeptMaps(data.departments ?? [])
  const ROLE_BORDER = deptMaps.border
  const ROLE_LABEL = deptMaps.label
  const ROLE_ORDER = deptMaps.order

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
      <div className="rounded-lg border border-border bg-background overflow-hidden w-full">

        {/* Header row */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] sticky top-0 z-10 border-b border-border" style={{ minHeight: 52 }}>
          <div className="border-r border-border bg-muted" />
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
                className={cn(
                  "relative flex flex-col items-center justify-center py-1.5 gap-[2px]",
                  holidayName ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-muted"
                )}
                style={isSat ? { borderLeft: "1px dashed var(--border)" } : undefined}
              >
                {day.warnings.length > 0 && (
                  <DayWarningPopover warnings={day.warnings} />
                )}

                <button
                  onClick={() => onDateClick?.(day.date)}
                  className={cn("flex flex-col items-center gap-[2px] cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
                >
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wday}</span>
                  <span className={cn(
                    "font-semibold leading-none text-[18px]",
                    today ? "size-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[15px]"
                    : holidayName ? "text-amber-600 dark:text-amber-400" : "text-primary"
                  )}>
                    {dayN}
                  </span>
                </button>
                {holidayName && (
                  <Tooltip>
                    <TooltipTrigger render={
                      <span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>
                    } />
                    <TooltipContent side="bottom">{holidayName}</TooltipContent>
                  </Tooltip>
                )}

                {/* Punciones + biopsias — single clickable area */}
                {(() => {
                  // Biopsy forecast: punciones from 5 and 6 days ago
                  const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
                  function getPuncForDate(dateStr: string): number {
                    // Try override, then default map, then lab config by weekday
                    if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
                    if (punctionsDefault[dateStr] !== undefined) return punctionsDefault[dateStr]
                    // Fallback: use weekday default from punctionsDefault of same weekday in current week
                    const dow = new Date(dateStr + "T12:00:00").getDay()
                    const sameDow = Object.entries(punctionsDefault).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
                    return sameDow ? sameDow[1] : 0
                  }
                  const d5ago = new Date(day.date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
                  const d6ago = new Date(day.date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
                  const d5str = d5ago.toISOString().split("T")[0]
                  const d6str = d6ago.toISOString().split("T")[0]
                  const p5 = getPuncForDate(d5str)
                  const p6 = getPuncForDate(d6str)
                  const forecast = Math.round(p5 * biopsyConversionRate * biopsyDay5Pct + p6 * biopsyConversionRate * biopsyDay6Pct)
                  const sources: string[] = []
                  if (p5 > 0) sources.push(t("punctionsD5", { count: p5 }))
                  if (p6 > 0) sources.push(t("punctionsD6", { count: p6 }))
                  const tooltip = forecast > 0 ? t("biopsyForecast", { count: forecast, sources: sources.join(", ") }) : t("punctionsLabel", { count: effectiveP })
                  return (
                    <DayStatsInput
                      date={day.date}
                      value={effectiveP}
                      defaultValue={defaultP}
                      isOverride={hasOverride}
                      onChange={onPunctionsChange}
                      disabled={isPublished || !data.rota}
                      biopsyForecast={forecast}
                      biopsyTooltip={tooltip}
                    />
                  )
                })()}

              </div>
            )
          })}
        </div>

        {/* Shift rows */}
        {SHIFT_ROWS.map((shiftRow) => (
          <div key={shiftRow} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border">
            {/* Shift label — right-aligned, three-line: code / start / end */}
            <div className="border-r border-border flex flex-col items-end justify-center px-2.5 py-2 bg-muted">
              <span className="text-[11px] leading-tight font-semibold text-foreground">{shiftRow}</span>
              <span className="text-[13px] font-medium leading-tight tabular-nums text-primary">
                {shiftTypeMap[shiftRow]?.start_time ? formatTime(shiftTypeMap[shiftRow].start_time, timeFormat) : shiftRow}
              </span>
              {shiftTypeMap[shiftRow]?.end_time && (
                <span className="text-[11px] text-muted-foreground leading-tight tabular-nums">
                  {formatTime(shiftTypeMap[shiftRow].end_time, timeFormat)}
                </span>
              )}
            </div>
            {localDays.map((day) => {
              const dayShifts    = [...day.assignments.filter((a) => a.shift_type === shiftRow && visibleStaffIds.has(a.staff_id))].sort((a, b) => a.staff.first_name.localeCompare(b.staff.first_name) || a.staff.last_name.localeCompare(b.staff.last_name))
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
                  style={isSatCell ? { borderLeft: "1px dashed var(--border)" } : undefined}
                  className={cn(
                    "p-1.5 flex flex-col gap-1",
                    dayShifts.length === 0 && effectivePDay === 0 ? "bg-muted/40" : "bg-background",
                    compact ? "min-h-[32px]" : "min-h-[48px]",
                    !isPublished && "cursor-pointer"
                  )}
                >
                  {dayShifts.map((a) => {
                    const staffMember = staffList.find((s) => s.id === a.staff_id)
                    const taskDisabled = data?.rotaDisplayMode === "by_shift" && !data?.enableTaskInShift
                    const cleanFn = a.function_label?.startsWith("dept_") ? null : a.function_label
                    const tecnica = taskDisabled ? null
                      : cleanFn
                      ? (data?.tecnicas ?? []).find((t) => t.codigo === cleanFn) ?? null
                      : (data?.tecnicas ?? []).find((t) => t.id === a.tecnica_id) ?? null
                    return (
                      <AssignmentPopover
                        key={a.id}
                        assignment={a}
                        staffSkills={staffMember?.staff_skills ?? []}
                        tecnicas={data?.tecnicas ?? []}
                        departments={data?.departments ?? []}
                        onFunctionSave={handleFunctionLabelSave}
                        isPublished={isPublished}
                        disabled={taskDisabled}
                      >
                        <Tooltip>
                          <TooltipTrigger render={
                            <div onClick={taskDisabled ? (e: React.MouseEvent) => { e.stopPropagation(); onChipClick(a, day.date) } : undefined} className={taskDisabled ? "cursor-pointer" : undefined}>
                              <DraggableShiftBadge
                                id={a.id}
                                first={a.staff.first_name}
                                last={a.staff.last_name}
                                role={a.staff.role}
                                isOverride={a.is_manual_override}
                                functionLabel={taskDisabled ? null : cleanFn}
                                tecnica={tecnica}
                                compact={compact}
                                borderColor={ROLE_BORDER[a.staff.role]}
                                isTrainingTecnica={!!(cleanFn && staffMember?.staff_skills?.find((sk) => sk.skill === cleanFn)?.level === "training")}
                                colorChips={colorChips}
                                readOnly={isPublished || taskDisabled}
                                staffId={a.staff_id}
                                staffColor={staffColorMap[a.staff_id]}
                                departments={data?.departments ?? []}
                              />
                            </div>
                          } />
                          <TooltipContent side="right">
                            {a.staff.first_name} {a.staff.last_name} · {ROLE_LABEL[a.staff.role] ?? a.staff.role}{tecnica ? ` · ${tecnica.nombre_es}` : cleanFn ? ` · ${cleanFn}` : ""}{cleanFn && staffMember?.staff_skills?.find((sk) => sk.skill === cleanFn)?.level === "training" ? ` · ${t("inTraining")}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      </AssignmentPopover>
                    )
                  })}
                  {/* Empty cell — grey bg applied via parent */}
                </DroppableCell>
              )
            })}
          </div>
        ))}

        {/* Dashed divider before OFF row */}
        <div className="h-px" style={{
          backgroundImage: "repeating-linear-gradient(90deg, var(--border) 0, var(--border) 6px, transparent 6px, transparent 12px)",
          backgroundSize: "12px 1px", backgroundRepeat: "repeat-x",
        }} />

        {/* OFF row */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] bg-muted">
          <div className="border-r border-border flex flex-col items-end justify-center px-2.5 py-2">
            <span className="text-[10px] text-muted-foreground leading-tight font-medium uppercase tracking-wide">OFF</span>
          </div>
          {localDays.map((day) => {
            const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
            const leaveIds    = new Set(onLeaveByDate[day.date] ?? [])
            const dow         = new Date(day.date + "T12:00:00").getDay() // 0=Sun, 6=Sat
            const isSaturday  = dow === 6
            const offCellId   = `OFF-${day.date}`

            // Unassigned staff — leave people first (non-draggable), then others
            const allOff = staffList.filter((s) => !assignedIds.has(s.id))
            const onLeaveStaff = allOff.filter((s) => leaveIds.has(s.id))
              .sort((a, b) => a.last_name.localeCompare(b.last_name))
            const availableOff = allOff.filter((s) => !leaveIds.has(s.id))
              .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
            return (
              <DroppableCell
                key={day.date}
                id={offCellId}
                isOver={overId === offCellId}
                isPublished={isPublished}
                style={isSaturday ? { borderLeft: "1px dashed var(--border)" } : undefined}
                className="p-1.5 flex flex-col gap-1 bg-muted"
              >
                {/* On leave — always first, not draggable, gray + airplane */}
                {onLeaveStaff.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  return (
                  <div
                    key={s.id}
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="flex items-center gap-1 py-0.5 text-[11px] font-medium w-full bg-muted text-muted-foreground border border-border select-none cursor-default transition-colors duration-150"
                    style={{ borderLeft: `3px solid ${isHov && staffColorMap[s.id] ? staffColorMap[s.id] : "var(--muted-foreground)"}`, borderRadius: 4, paddingLeft: 5, paddingRight: 6, ...(isHov && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : {}) }}
                  >
                    <span className="truncate italic">{s.first_name} {s.last_name[0]}.</span>
                    <Plane className="size-3 shrink-0 ml-auto text-muted-foreground/40" />
                  </div>
                  )
                })}
                {/* Available — draggable */}
                {availableOff.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  return (
                  <DraggableOffStaff key={s.id} staffId={s.id} date={day.date} disabled={isPublished}>
                    <div
                      onMouseEnter={() => setHovered(s.id)}
                      onMouseLeave={() => setHovered(null)}
                      className="flex items-center gap-1 py-0.5 text-[11px] font-medium w-full bg-background text-muted-foreground border border-border transition-colors duration-150"
                      style={{ borderLeft: `3px solid ${isHov && staffColorMap[s.id] ? staffColorMap[s.id] : (ROLE_BORDER[s.role] ?? "#94A3B8")}`, borderRadius: 4, paddingLeft: 5, paddingRight: 6, ...(isHov && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : {}) }}
                    >
                      <span className="truncate">{s.first_name} {s.last_name[0]}.</span>
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
              borderColor={ROLE_BORDER[activeAssignment.staff.role]}
              departments={data?.departments ?? []}
              tecnica={activeAssignment.function_label
                ? (data?.tecnicas ?? []).find((t) => t.codigo === activeAssignment.function_label) ?? null
                : (data?.tecnicas ?? []).find((t) => t.id === activeAssignment.tecnica_id) ?? null}
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
              borderColor={ROLE_BORDER[activeOffStaff.role]}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── Month view ────────────────────────────────────────────────────────────────

// ── Month punctions inline editor ──────────────────────────────────────────

function MonthPunctionsEdit({ date, value, defaultValue, isOverride, onChange }: {
  date: string; value: number; defaultValue: number; isOverride: boolean
  onChange?: (date: string, value: number | null) => void
}) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function save() {
    if (onChange) onChange(date, draft === defaultValue ? null : draft)
    setOpen(false)
  }

  if (!onChange) {
    return (
      <span className={cn("text-[12px] tabular-nums", isOverride ? "text-primary font-medium" : "text-muted-foreground")}>
        P:{value}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <Tooltip>
        <TooltipTrigger render={
          <button
            onClick={(e) => { e.stopPropagation(); setDraft(value); setOpen((o) => !o) }}
            className={cn(
              "text-[12px] tabular-nums rounded px-0.5 transition-colors hover:bg-muted group/pedit",
              isOverride ? "text-primary font-medium" : "text-muted-foreground"
            )}
          >
            P:{value}
            <Pencil className="size-2 ml-0.5 inline opacity-0 group-hover/pedit:opacity-50 transition-opacity" />
          </button>
        } />
        <TooltipContent side="top">
          {isOverride ? t("customValue", { value: defaultValue }) : t("clickToEditPunctions")}
        </TooltipContent>
      </Tooltip>

      {open && (
        <div
          className="absolute left-0 bottom-full mb-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-32 flex flex-col gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-1">
            <button
              onClick={() => setDraft((d) => Math.max(0, d - 1))}
              className="size-6 rounded border border-border flex items-center justify-center text-[13px] hover:bg-muted transition-colors"
            >−</button>
            <input
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-10 text-center text-[12px] border border-input rounded px-1 py-0.5 outline-none bg-background"
            />
            <button
              onClick={() => setDraft((d) => d + 1)}
              className="size-6 rounded border border-border flex items-center justify-center text-[13px] hover:bg-muted transition-colors"
            >+</button>
          </div>
          <div className="flex gap-1">
            <button onClick={save} className="flex-1 text-[10px] bg-primary text-primary-foreground rounded px-2 py-1 hover:opacity-90">OK</button>
            {isOverride && (
              <button
                onClick={() => { if (onChange) onChange(date, null); setOpen(false) }}
                className="flex-1 text-[10px] text-muted-foreground border border-border rounded px-2 py-1 hover:bg-muted"
              >Reset</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const DOW_HEADERS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const DOW_HEADERS_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]

/** Rotate an array by `offset` positions (e.g. offset=6 moves Sun to front) */
function rotateArray<T>(arr: T[], offset: number): T[] {
  if (offset === 0) return arr
  const n = arr.length
  const o = ((offset % n) + n) % n
  return [...arr.slice(o), ...arr.slice(0, o)]
}

function MonthGrid({ summary, loading, locale, currentDate, onSelectDay, onSelectWeek, firstDayOfWeek = 0, punctionsOverride = {}, onPunctionsChange, monthViewMode = "shift" }: {
  summary: RotaMonthSummary | null
  loading: boolean
  locale: string
  currentDate: string
  onSelectDay: (date: string) => void
  onSelectWeek: (weekStart: string) => void
  firstDayOfWeek?: number
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  monthViewMode?: "shift" | "person"
}) {
  const t = useTranslations("schedule")
  const { hoveredStaffId, setHovered } = useStaffHover()
  const baseHeaders = locale === "es" ? DOW_HEADERS_ES : DOW_HEADERS_EN
  const headers = rotateArray(baseHeaders, firstDayOfWeek)

  if (loading || !summary) {
    return (
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5 mb-1">
          <div />
          {headers.map((h) => (
            <div key={h} className="text-center text-[11px] font-medium text-muted-foreground py-1">{h}</div>
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, w) => (
          <div key={w} className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5">
            <Skeleton className="h-[120px] rounded-lg" />
            {Array.from({ length: 7 }).map((_, d) => (
              <Skeleton key={d} className="h-[120px] rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const weeks: (typeof summary.days)[] = []
  for (let i = 0; i < summary.days.length; i += 7) {
    weeks.push(rotateArray(summary.days.slice(i, i + 7), firstDayOfWeek))
  }

  const weekStatusMap = Object.fromEntries(summary.weekStatuses.map((ws) => [ws.weekStart, ws.status]))

  // Compute which column indices are weekends (Sat=5, Sun=6 in base, rotated)
  const weekendIndices = new Set(
    [5, 6].map((i) => ((i - firstDayOfWeek) % 7 + 7) % 7)
  )

  return (
    <div className="flex flex-col gap-1.5">
      {/* Day headers — with week number column */}
      <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5 mb-1">
        <div className="text-center text-[11px] font-medium text-muted-foreground/40 py-2">S</div>
        {headers.map((h, i) => (
          <div key={h} className={cn(
            "text-center text-[13px] font-semibold py-2",
            weekendIndices.has(i) ? "text-muted-foreground/60 bg-muted/40 rounded-t-lg" : "text-muted-foreground"
          )}>{h}</div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const weekStart = week[0].date
        const weekStatus = weekStatusMap[weekStart] ?? null
        const isWeekPublished = weekStatus === "published"
        // ISO week number
        const d = new Date(weekStart + "T12:00:00")
        const jan1 = new Date(d.getFullYear(), 0, 1)
        const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
        return (
          <div key={wi} className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5">
            {/* Week number + publish lock */}
            <div className="flex flex-col items-center justify-center gap-0.5">
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => onSelectWeek(weekStart)}
                    className="text-[11px] font-medium text-muted-foreground/50 hover:text-primary transition-colors"
                  >
                    S{weekNum}
                  </button>
                } />
                <TooltipContent side="left">{t("goToWeek", { week: weekNum })}</TooltipContent>
              </Tooltip>
              {isWeekPublished && (
                <Tooltip>
                  <TooltipTrigger render={
                    <Lock className="size-3 text-emerald-500 cursor-default" />
                  } />
                  <TooltipContent side="left">{t("published")}</TooltipContent>
                </Tooltip>
              )}
            </div>
              {week.map((day) => {
                const isToday    = day.date === TODAY
                const dayNum     = String(new Date(day.date + "T12:00:00").getDate())
                const dayDow     = new Date(day.date + "T12:00:00").getDay()
                const isSat      = dayDow === 6
                const isSun      = dayDow === 0

                const tooltipParts: string[] = []
                if (day.staffCount > 0) {
                  const depts: string[] = []
                  if (day.labCount > 0) depts.push(`Em ${day.labCount}`)
                  if (day.andrologyCount > 0) depts.push(`An ${day.andrologyCount}`)
                  if (day.adminCount > 0) depts.push(`Ad ${day.adminCount}`)
                  tooltipParts.push(depts.join(" · "))
                }
                if (day.punctions > 0) tooltipParts.push(`P: ${day.punctions}`)
                {
                  const s = summary as RotaMonthSummary
                  const d5ago = new Date(day.date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
                  const d6ago = new Date(day.date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
                  const p5 = s.days.find((dd) => dd.date === d5ago.toISOString().split("T")[0])?.punctions ?? 0
                  const p6 = s.days.find((dd) => dd.date === d6ago.toISOString().split("T")[0])?.punctions ?? 0
                  const bForecast = Math.round(p5 * (s.biopsyConversionRate ?? 0.5) * (s.biopsyDay5Pct ?? 0.5) + p6 * (s.biopsyConversionRate ?? 0.5) * (s.biopsyDay6Pct ?? 0.5))
                  if (bForecast > 0) tooltipParts.push(`B: ${bForecast}`)
                }
                if (day.leaveCount > 0) tooltipParts.push(`${day.leaveCount} ${t("absences")}`)
                if (day.hasSkillGaps) tooltipParts.push(t("uncoveredTasks"))
                if (day.holidayName) tooltipParts.push(day.holidayName)
                const tooltipText = tooltipParts.length > 0 ? tooltipParts.join(" · ") : null

                return (
                  <Tooltip key={day.date}>
                    <TooltipTrigger render={
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectDay(day.date) }}
                    style={{
                      ...(isSat ? { borderLeft: "1px dashed var(--border)" } : {}),
                      ...(isSun ? { borderRight: "1px dashed var(--border)" } : {}),
                    }}
                    className={cn(
                      "relative flex flex-col items-start p-2.5 rounded-lg border text-left transition-colors min-h-[120px]",
                      !day.isCurrentMonth
                        ? "bg-muted/40 border-border/30"
                        : day.holidayName
                        ? "bg-amber-500/10 border-amber-500/20"
                        : day.staffCount > 0
                        ? day.isWeekend
                          ? "bg-muted/40 border-border hover:bg-accent/20"
                          : "bg-muted/20 border-border hover:bg-accent/10"
                        : day.isWeekend
                        ? "bg-background border-dashed border-border/50 hover:bg-accent/10"
                        : "bg-background border-dashed border-border/50 hover:bg-accent/10"
                    )}
                  >
                    {/* Top row: date + status icon */}
                    <div className="flex items-start justify-between w-full">
                      <div className={cn(
                        "flex items-center justify-center rounded-full leading-none",
                        isToday
                          ? "size-8 bg-primary text-primary-foreground text-[20px] font-bold"
                          : !day.isCurrentMonth
                          ? "text-muted-foreground/25 text-[16px] font-normal"
                          : "text-[20px] font-bold text-foreground"
                      )}>
                        {dayNum}
                      </div>
                      {day.staffCount > 0 && (
                        day.hasSkillGaps
                          ? <AlertTriangle className="size-4 text-amber-500" />
                          : <CheckCircle2 className="size-4 text-emerald-500 dark:text-emerald-400" />
                      )}
                    </div>

                    {/* Holiday name */}
                    {day.holidayName && day.isCurrentMonth && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight truncate w-full mt-1">{day.holidayName}</span>
                    )}

                    {/* Staff display — shift mode (dept badges) or person mode (initials) */}
                    {day.staffCount > 0 && day.isCurrentMonth && monthViewMode === "person" ? (
                      <div className="flex flex-wrap gap-0.5 mt-auto">
                        {(day.staffInitials ?? []).map((si, i) => {
                          const roleColor = si.role === "lab" ? "#3B82F6" : si.role === "andrology" ? "#10B981" : "#64748B"
                          const isHov = hoveredStaffId === si.id
                          return (
                            <span
                              key={i}
                              className="text-[9px] font-semibold rounded px-1 py-px border border-border transition-colors cursor-default"
                              style={{
                                borderLeft: `2px solid ${roleColor}`,
                                ...(isHov ? { backgroundColor: roleColor + "25", color: roleColor, borderColor: roleColor + "40" } : {}),
                              }}
                              onMouseEnter={() => setHovered(si.id)}
                              onMouseLeave={() => setHovered(null)}
                            >
                              {si.initials}
                            </span>
                          )
                        })}
                        {day.staffCount > 10 && (
                          <span className="text-[9px] text-muted-foreground/50">+{day.staffCount - 10}</span>
                        )}
                      </div>
                    ) : day.staffCount > 0 && day.isCurrentMonth ? (
                      <div className="flex items-center gap-0.5 mt-auto text-[12px] font-semibold text-muted-foreground">
                        {day.labCount > 0 && (
                          <span style={{ borderLeft: "2px solid #3B82F6", paddingLeft: 3 }}>{day.labCount}E</span>
                        )}
                        {day.labCount > 0 && (day.andrologyCount > 0 || day.adminCount > 0) && (
                          <span className="text-muted-foreground/30 mx-0.5">|</span>
                        )}
                        {day.andrologyCount > 0 && (
                          <span style={{ borderLeft: "2px solid #10B981", paddingLeft: 3 }}>{day.andrologyCount}A</span>
                        )}
                        {day.andrologyCount > 0 && day.adminCount > 0 && (
                          <span className="text-muted-foreground/30 mx-0.5">|</span>
                        )}
                        {day.adminCount > 0 && (
                          <span style={{ borderLeft: "2px solid #64748B", paddingLeft: 3 }}>{day.adminCount}Ad</span>
                        )}
                      </div>
                    ) : null}

                    {/* Empty cells are visually distinct via dashed border + no bg tint */}

                    {/* Punctions + ratio + leave */}
                    {day.isCurrentMonth && (() => {
                      const isOverride = punctionsOverride[day.date] !== undefined
                      const effectiveP = punctionsOverride[day.date] ?? day.punctions
                      // Biopsy forecast — use summary days or weekday fallback
                      const s = summary as RotaMonthSummary
                      const d5ago = new Date(day.date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
                      const d6ago = new Date(day.date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
                      const d5str = d5ago.toISOString().split("T")[0]
                      const d6str = d6ago.toISOString().split("T")[0]
                      function getPuncFromSummary(dateStr: string): number {
                        const found = s.days.find((dd) => dd.date === dateStr)
                        if (found) return found.punctions
                        // Fallback: same weekday from any day in summary
                        const dow = new Date(dateStr + "T12:00:00").getDay()
                        const sameDow = s.days.find((dd) => new Date(dd.date + "T12:00:00").getDay() === dow)
                        return sameDow?.punctions ?? 0
                      }
                      const p5src = getPuncFromSummary(d5str)
                      const p6src = getPuncFromSummary(d6str)
                      const bForecast = Math.round(p5src * (s.biopsyConversionRate ?? 0.5) * (s.biopsyDay5Pct ?? 0.5) + p6src * (s.biopsyConversionRate ?? 0.5) * (s.biopsyDay6Pct ?? 0.5))
                      return (
                        <div className="flex items-center gap-2 mt-1 text-[12px] tabular-nums">
                          <MonthPunctionsEdit
                            date={day.date}
                            value={effectiveP}
                            defaultValue={day.punctions}
                            isOverride={isOverride}
                            onChange={onPunctionsChange}
                          />
                          <span className="font-medium text-muted-foreground">B:{bForecast}</span>
                          {day.leaveCount > 0 && (
                            <span className="flex items-center gap-0.5 text-amber-500">
                              <Briefcase className="size-3" />{day.leaveCount}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </button>
                    } />
                    {tooltipText && <TooltipContent side="top">{tooltipText}</TooltipContent>}
                  </Tooltip>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({ day, loading, locale, departments = [], punctions, biopsyForecast, isEditMode, onRemoveAssignment, onAddStaff, data, staffList, mobileCompact, mobileDeptColor = true }: {
  day: RotaDay | null
  loading: boolean
  locale: string
  departments?: import("@/lib/types/database").Department[]
  punctions?: number
  biopsyForecast?: number
  isEditMode?: boolean
  onRemoveAssignment?: (id: string) => void
  onAddStaff?: (role: string) => void
  data?: RotaWeekData | null
  staffList?: StaffWithSkills[]
  mobileCompact?: boolean
  mobileDeptColor?: boolean
}) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")

  // Build dept color map: role code → colour
  const { hoveredStaffId, setHovered } = useStaffHover()
  const deptColorMap: Record<string, string> = {}
  const deptLabelMap: Record<string, string> = {}
  for (const d of departments) {
    if (!d.parent_id) {
      deptColorMap[d.code] = d.colour
      deptLabelMap[d.code] = d.name
    }
  }
  // Leave type icons
  const LEAVE_ICON_MAP: Record<string, typeof Plane> = { annual: Plane, sick: Cross, personal: User, training: GraduationCap, maternity: Baby, other: CalendarX }
  // Staff individual colors
  const FALLBACK_COLORS_DAY = [
    "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
    "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  ]
  const staffColorMap: Record<string, string> = {}
  ;(staffList ?? []).forEach((s, i) => { staffColorMap[s.id] = s.color || FALLBACK_COLORS_DAY[i % FALLBACK_COLORS_DAY.length] })

  if (loading) {
    return (
      <div className="flex flex-col gap-4 w-full animate-pulse">
        <Skeleton className="h-5 w-40 rounded-md" />
        {[4, 5, 3, 4].map((count, g) => (
          <div key={g} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-28 rounded" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} className="h-8 rounded-md" style={{ width: [72, 85, 68, 90, 76][i % 5] }} />
              ))}
            </div>
          </div>
        ))}
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
    <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">
      {/* Punctions + biopsies header */}
      {(punctions !== undefined || biopsyForecast !== undefined) && (
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          {punctions !== undefined && <span>P: <strong className="text-foreground">{punctions}</strong></span>}
          {biopsyForecast !== undefined && <span>B: <strong className="text-foreground">{biopsyForecast}</strong></span>}
          <span className="text-muted-foreground/40">·</span>
          <span>{t("assignmentCount", { count: day.assignments.length })}</span>
        </div>
      )}

      {(day.skillGaps.length > 0) && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">{t("insufficientCoverage")}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {day.skillGaps.map((sk) => (
                <Badge key={sk} variant="skill-gap">
                  {sk}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {(() => {
        // Group by shift type instead of department
        const shiftTypes = data?.shiftTypes ?? []
        const byShift: Record<string, typeof day.assignments> = {}
        for (const a of day.assignments) {
          if (!byShift[a.shift_type]) byShift[a.shift_type] = []
          byShift[a.shift_type].push(a)
        }
        const shiftOrder = shiftTypes.filter((s) => s.active !== false).map((s) => s.code)
        const allShifts = [...new Set([...shiftOrder, ...Object.keys(byShift)])]

        // Dept and tecnica lookup for resolving function_label
        const deptByCode = Object.fromEntries((departments ?? []).map((d) => [d.code, d]))
        const tecByCode = Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.codigo, t]))

        function resolveFunctionLabel(label: string): string {
          const dept = deptByCode[label]
          if (dept) return dept.abbreviation || dept.name
          const tec = tecByCode[label]
          if (tec) return tec.nombre_es
          return label
        }

        return allShifts.map((shiftCode, shiftIdx) => {
          const assignments = byShift[shiftCode] ?? []
          const st = shiftTypes.find((s) => s.code === shiftCode)
          const timeLabel = st ? `${st.start_time}–${st.end_time}` : ""
          return (
            <Fragment key={shiftCode}>
            {shiftIdx > 0 && <div className="h-px bg-border/50 my-1" />}
            <div key={shiftCode} className="flex flex-col gap-1.5">
              {/* Shift header */}
              <div className="flex items-center gap-2 pl-2 border-l-[3px] border-primary/40">
                <span className="text-[14px] font-semibold">{shiftCode}</span>
                {timeLabel && <span className="text-[12px] text-muted-foreground">{timeLabel}</span>}
                <span className="text-[11px] text-muted-foreground ml-auto">{assignments.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                {assignments.length === 0 && !isEditMode && (
                  <div className="h-6 rounded bg-muted/40" />
                )}
                {mobileCompact ? (
                  /* Compact: inline badges with left border, sorted by dept then name */
                  <div className="flex flex-wrap gap-1">
                    {[...assignments].sort((a, b) => {
                      const ro: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
                      const rd = (ro[a.staff.role] ?? 9) - (ro[b.staff.role] ?? 9)
                      return rd !== 0 ? rd : a.staff.first_name.localeCompare(b.staff.first_name)
                    }).map((a) => {
                      const roleColor = deptColorMap[a.staff.role] ?? (a.staff.role === "lab" ? "#3B82F6" : a.staff.role === "andrology" ? "#10B981" : "#64748B")
                      const fnLabel = a.function_label ? resolveFunctionLabel(a.function_label) : null
                      const staffMember = staffList?.find((s) => s.id === a.staff_id)
                      const deptName = deptLabelMap[a.staff.role] ?? a.staff.role
                      const workDays = staffMember?.working_pattern ?? []
                      const dayLabels = { mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" } as Record<string, string>
                      const pillContent = (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-[13px] font-medium cursor-pointer transition-colors active:scale-95"
                          style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 6 }}
                        >
                          {a.staff.first_name} {a.staff.last_name[0]}.
                          {fnLabel && <span className="text-[9px] text-muted-foreground">{fnLabel}</span>}
                          {isEditMode && onRemoveAssignment && (
                            <button onClick={(e) => { e.stopPropagation(); onRemoveAssignment(a.id) }} className="text-muted-foreground hover:text-destructive ml-0.5"><X className="size-3" /></button>
                          )}
                        </span>
                      )
                      return isEditMode ? (
                        <Fragment key={a.id}>{pillContent}</Fragment>
                      ) : (
                        <TapPopover key={a.id} trigger={pillContent}>
                          <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                          {(() => {
                            // Show actual days working this week
                            const weekDays = data?.days ?? []
                            const workedDays = weekDays.filter((d) => d.assignments.some((as) => as.staff_id === a.staff_id))
                            const dayAbbrs = workedDays.map((d) => {
                              const dow = new Date(d.date + "T12:00:00").getDay()
                              return (["D", "L", "M", "X", "J", "V", "S"])[dow]
                            })
                            return <p className="text-[11px] opacity-70">{deptName} · {workedDays.length}/{staffMember?.days_per_week ?? "?"}d · {dayAbbrs.join(" ")}</p>
                          })()}
                        </TapPopover>
                      )
                    })}
                  </div>
                ) : [...assignments].sort((a, b) => {
                  const ro: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
                  const rd = (ro[a.staff.role] ?? 9) - (ro[b.staff.role] ?? 9)
                  return rd !== 0 ? rd : a.staff.first_name.localeCompare(b.staff.first_name)
                }).map((a) => {
                  const roleColor = deptColorMap[a.staff.role] ?? (a.staff.role === "lab" ? "#3B82F6" : a.staff.role === "andrology" ? "#10B981" : "#64748B")
                  const fnLabel = a.function_label ? resolveFunctionLabel(a.function_label) : null
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-background"
                      style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 8 }}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <span className="text-[15px] font-medium truncate">{a.staff.first_name} {a.staff.last_name}</span>
                        {fnLabel && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">{fnLabel}</span>
                        )}
                      </div>
                      {isEditMode && onRemoveAssignment && (
                        <button
                          onClick={() => onRemoveAssignment(a.id)}
                          className="size-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive active:bg-destructive/10 shrink-0"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
                {isEditMode && onAddStaff && (
                  <button
                    onClick={() => onAddStaff(assignments[0]?.staff.role ?? "lab")}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-primary/30 text-[12px] text-primary font-medium active:bg-primary/5"
                  >
                    + {tc("add")}
                  </button>
                )}
              </div>
            </div>
          </Fragment>
          )
        })
      })()}

      {/* OFF section — staff not assigned today */}
      {day && staffList && staffList.length > 0 && (() => {
        const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
        const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
        const leaveIds = new Set(data?.onLeaveByDate?.[day.date] ?? [])
        const onLeave = staffList.filter((s) => leaveIds.has(s.id))
          .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.first_name.localeCompare(b.first_name))
        const offDuty = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id))
          .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.first_name.localeCompare(b.first_name))
        if (onLeave.length === 0 && offDuty.length === 0) return null
        return (
          <div className="flex flex-col gap-1.5 mt-2 pt-3 pb-2 px-2 -mx-2 border-t border-dashed border-border bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 pl-2">
              <span className="text-[13px] font-medium text-muted-foreground">{t("offSection")}</span>
              <span className="text-[12px] text-muted-foreground/60">{onLeave.length + offDuty.length}</span>
            </div>
            {mobileCompact ? (
              <div className="flex flex-wrap gap-1">
                {onLeave.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  const sColor = staffColorMap[s.id] ?? "#BFDBFE"
                  const leaveType = day ? (data?.onLeaveTypeByDate?.[day.date]?.[s.id] ?? "other") : "other"
                  const LeaveIcon = LEAVE_ICON_MAP[leaveType] ?? CalendarX
                  return (
                    <TapPopover key={s.id} trigger={
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] italic cursor-pointer active:scale-95 transition-colors", isHov ? "" : "border-amber-200 bg-amber-50 text-amber-700")}
                        style={isHov ? { backgroundColor: sColor, borderColor: sColor, color: "#1e293b" } : undefined}
                        onClick={(e) => { e.stopPropagation(); setHovered(hoveredStaffId === s.id ? null : s.id) }}>
                        <LeaveIcon className="size-2.5 shrink-0" />
                        {s.first_name} {s.last_name[0]}.
                      </span>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d</p>
                    </TapPopover>
                  )
                })}
                {offDuty.map((s) => {
                  const roleColor = deptColorMap[s.role] ?? "#64748B"
                  const isHov = hoveredStaffId === s.id
                  const sColor = staffColorMap[s.id] ?? "#BFDBFE"
                  return (
                    <TapPopover key={s.id} trigger={
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] cursor-pointer active:scale-95 transition-colors", isHov ? "" : "border-border bg-background text-muted-foreground")}
                        style={{ ...(isHov ? { backgroundColor: sColor, borderColor: sColor, color: "#1e293b" } : (mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {})), borderRadius: 6 }}
                        onClick={(e) => { e.stopPropagation(); setHovered(hoveredStaffId === s.id ? null : s.id) }}>
                        {s.first_name} {s.last_name[0]}.
                      </span>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d · {(s.working_pattern ?? []).map((d) => ({ mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" } as Record<string, string>)[d] ?? d).join(" ")}</p>
                    </TapPopover>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {onLeave.map((s) => {
                  const leaveType = day ? (data?.onLeaveTypeByDate?.[day.date]?.[s.id] ?? "other") : "other"
                  const LeaveIcon = LEAVE_ICON_MAP[leaveType] ?? CalendarX
                  return (
                    <div key={s.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50">
                      <LeaveIcon className="size-3 text-amber-500 shrink-0" />
                      <span className="text-[13px] text-amber-700 italic">{s.first_name} {s.last_name}</span>
                    </div>
                  )
                })}
                {offDuty.map((s) => {
                  const roleColor = deptColorMap[s.role] ?? "#64748B"
                  return (
                    <div key={s.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border/50 bg-background text-muted-foreground" style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 8 }}>
                      <span className="text-[13px]">{s.first_name} {s.last_name}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ── Override dialog ───────────────────────────────────────────────────────────

type GenerationStrategy = "strict_template" | "flexible_template" | "ai_optimal" | "manual"

const STRATEGY_CARD_META: { key: GenerationStrategy; icon: React.ReactNode; titleKey: string; descKey: string; badge: string; badgeColor: string }[] = [
  {
    key: "strict_template", icon: <BookmarkX className="size-5" />,
    titleKey: "strictTemplate", descKey: "strictTemplateDesc",
    badge: "HARD", badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
  {
    key: "flexible_template", icon: <Bookmark className="size-5" />,
    titleKey: "flexibleTemplate", descKey: "flexibleTemplateDesc",
    badge: "SOFT", badgeColor: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  },
  {
    key: "ai_optimal", icon: <Sparkles className="size-5" />,
    titleKey: "aiOptimal", descKey: "aiOptimalDesc",
    badge: "IA", badgeColor: "bg-purple-500/10 text-muted-foreground border-purple-500/20",
  },
  {
    key: "manual", icon: <Grid3X3 className="size-5" />,
    titleKey: "blankWeek", descKey: "blankWeekDesc",
    badge: "MANUAL", badgeColor: "bg-muted text-muted-foreground border-border",
  },
]

function GenerationStrategyModal({ open, weekStart, weekLabel, onClose, onGenerate }: {
  open: boolean; weekStart: string; weekLabel: string
  onClose: () => void
  onGenerate: (strategy: GenerationStrategy, templateId?: string) => void
}) {
  const t = useTranslations("schedule")
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-[520px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <p className="text-[15px] font-medium">{t("generateScheduleFor", { week: weekLabel })}</p>
        </div>

        {/* Strategy cards — 2×2 grid */}
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {STRATEGY_CARD_META.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => { setSelected(card.key); setSelectedTplId(null) }}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-lg p-3.5 text-left transition-all",
                  selected === card.key
                    ? "bg-primary/10"
                    : "hover:bg-muted"
                )}
                style={{ border: `2px solid ${selected === card.key ? "var(--primary)" : "var(--border)"}` }}
              >
                <div className={selected === card.key ? "text-primary" : "text-muted-foreground"}>{card.icon}</div>
                <p className={cn("text-[14px] font-medium leading-tight", selected === card.key && "text-primary")}>{t(card.titleKey)}</p>
                <p className="text-[12px] text-muted-foreground leading-snug">{t(card.descKey)}</p>
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
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                  <p className="text-[13px] text-amber-600 dark:text-amber-400">{t("noTemplatesSaved")}</p>
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-0.5">
                    {t("noTemplatesSavedHint")}
                  </p>
                </div>
              ) : (
                <select
                  value={selectedTplId ?? ""}
                  onChange={(e) => setSelectedTplId(e.target.value || null)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                >
                  <option value="">{t("selectTemplate")}</option>
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
        <div className="px-5 py-3 border-t border-border shrink-0 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>{tc("cancel")}</Button>
          <Button
            size="sm"
            disabled={!canGenerate}
            onClick={() => { if (selected) onGenerate(selected, selectedTplId ?? undefined) }}
          >
            {tc("generate")}
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-[380px] p-5">
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-[440px] max-h-[70vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border shrink-0">
          <p className="text-[14px] font-medium">{t("applyTemplate")}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => <div key={i} className="shimmer-bar h-16 w-full rounded-lg" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[14px] font-medium text-muted-foreground">{t("noTemplates")}</p>
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
        <div className="px-5 py-3 border-t border-border shrink-0 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>{tc("cancel")}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Department filter ─────────────────────────────────────────────────────────


function DepartmentFilterDropdown({ selected, allDepts, onToggle, onSetAll, onSetOnly, deptLabels, deptColors, deptAbbr }: {
  selected: Set<string>; allDepts: string[]
  onToggle: (d: string) => void; onSetAll: () => void; onSetOnly: (d: string) => void
  deptLabels: Record<string, string>; deptColors: Record<string, string>; deptAbbr: Record<string, string>
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
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

  const allSelected = selected.size === allDepts.length
  const label = allSelected
    ? tc("all")
    : allDepts.filter((d) => selected.has(d)).map((d) => deptAbbr[d] ?? d).join(" · ")

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-medium transition-colors shrink-0",
          allSelected ? "text-muted-foreground hover:bg-muted" : "text-blue-700 bg-blue-50 hover:bg-blue-100"
        )}
      >
        <Filter className="size-3 shrink-0" />
        <span className="truncate max-w-[140px]">{label}</span>
        {!allSelected && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetAll() }}
            className="ml-0.5 text-blue-400 hover:text-blue-600"
          >
            <X className="size-3" />
          </button>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[280px] rounded-lg border border-border bg-background shadow-lg py-1.5">
          {/* Toggle all */}
          <button
            onClick={() => { allSelected ? setOpen(false) : onSetAll() }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <span className={cn("size-3.5 rounded border flex items-center justify-center", allSelected ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
              {allSelected && <span className="text-[9px]">✓</span>}
            </span>
            {t("selectAll")}
          </button>
          <div className="h-px bg-border my-1" />
          {allDepts.map((dept) => {
            const checked = selected.has(dept)
            return (
              <button
                key={dept}
                onClick={() => onToggle(dept)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[13px] hover:bg-muted/50 transition-colors"
              >
                <span className={cn("size-3.5 rounded border flex items-center justify-center", checked ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                  {checked && <span className="text-[9px]">✓</span>}
                </span>
                <span className="size-2 rounded-full shrink-0" style={{ background: deptColors[dept] }} />
                <span className="font-medium">{deptLabels[dept] ?? dept}</span>
              </button>
            )
          })}
          {/* Quick shortcuts */}
          <div className="h-px bg-border my-1" />
          <div className="px-3 py-1 flex gap-1">
            {allDepts.map((dept) => (
              <button
                key={dept}
                onClick={() => { onSetOnly(dept); setOpen(false) }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent hover:text-blue-700 hover:border-blue-200 transition-colors"
              >
                {t("onlyDept", { dept: deptLabels[dept] })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

function MobileOverflow({ onGenerateWeek, onGenerateDay, onShare, isPending, compact, onToggleCompact, deptColor, onToggleDeptColor, highlight, onToggleHighlight }: { onGenerateWeek: () => void; onGenerateDay?: () => void; onShare?: () => void; isPending?: boolean; compact?: boolean; onToggleCompact?: () => void; deptColor?: boolean; onToggleDeptColor?: () => void; highlight?: boolean; onToggleHighlight?: () => void }) {
  const t = useTranslations("schedule")
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])
  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="size-9 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
        <MoreHorizontal className="size-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-[100] w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1">
          <button onClick={() => { setOpen(false); onGenerateWeek() }} disabled={isPending} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors disabled:opacity-50">
            <Sparkles className="size-4" />
            {locale === "es" ? "Generar semana" : "Generate week"}
          </button>
          {onGenerateDay && (
            <button onClick={() => { setOpen(false); onGenerateDay() }} disabled={isPending} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors disabled:opacity-50">
              <CalendarDays className="size-4" />
              {locale === "es" ? "Regenerar día" : "Regenerate day"}
            </button>
          )}
          {onShare && (
            <button onClick={() => { setOpen(false); onShare() }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
              <Share className="size-4" />
              {locale === "es" ? "Compartir imagen" : "Share image"}
            </button>
          )}
          {onToggleCompact && (
            <>
              <div className="h-px bg-border mx-2 my-1" />
              <button onClick={() => { onToggleCompact(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                <Rows3 className="size-4" />
                {locale === "es" ? "Vista compacta" : "Compact view"}
                {compact && <CheckCircle2 className="size-3.5 text-primary ml-auto" />}
              </button>
              {onToggleDeptColor && (
                <button onClick={() => { onToggleDeptColor(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                  <span className="size-4 rounded-sm shrink-0" style={{ borderLeft: "3px solid #3B82F6", borderTop: "3px solid #10B981", borderRight: "3px solid #64748B", borderBottom: "3px solid #F59E0B" }} />
                  {locale === "es" ? "Colores departamento" : "Department colors"}
                  {deptColor && <CheckCircle2 className="size-3.5 text-primary ml-auto" />}
                </button>
              )}
              {onToggleHighlight && (
                <button onClick={() => { onToggleHighlight(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                  <span className="size-4 rounded-sm shrink-0" style={{ backgroundColor: "#FDE047" }} />
                  {locale === "es" ? "Resaltar" : "Highlights"}
                  {highlight && <CheckCircle2 className="size-3.5 text-primary ml-auto" />}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function CalendarPanel(props: { refreshKey?: number; chatOpen?: boolean }) {
  return (
    <StaffHoverProvider>
      <CalendarPanelInner {...props} />
    </StaffHoverProvider>
  )
}

function CalendarPanelInner({ refreshKey = 0, chatOpen = false }: { refreshKey?: number; chatOpen?: boolean }) {
  const t      = useTranslations("schedule")
  const tc     = useTranslations("common")
  const ts     = useTranslations("skills")
  const locale = useLocale()
  const canEdit = useCanEdit()
  const viewerStaffId = useViewerStaffId()

  const [view, setViewState]            = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "week"
    return (sessionStorage.getItem("labrota_view") as ViewMode) || "week"
  })
  const setView = (v: ViewMode) => { setViewState(v); sessionStorage.setItem("labrota_view", v) }
  const [calendarLayout, setCalendarLayoutState] = useState<CalendarLayout>("shift")
  const [compact, setCompact] = useState(false)
  const [daysAsRows, setDaysAsRows] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("labrota_days_as_rows") === "true"
  })
  const [colorChips, setColorChips] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem("labrota_color_chips") !== "false"
  })
  const { enabled: highlightHover, setEnabled: setHighlightHover } = useStaffHover()
  const [currentDate, setCurrentDateState] = useState(() => {
    if (typeof window === "undefined") return TODAY
    return sessionStorage.getItem("labrota_current_date") || TODAY
  })
  const setCurrentDate: typeof setCurrentDateState = (v) => {
    setCurrentDateState((prev) => {
      const next = typeof v === "function" ? v(prev) : v
      sessionStorage.setItem("labrota_current_date", next)
      return next
    })
  }
  const [weekData, setWeekData]         = useState<RotaWeekData | null>(null)
  const [monthSummary, setMonthSummary] = useState<RotaMonthSummary | null>(null)
  const [loadingWeek, setLoadingWeek]   = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [multiWeekScope, setMultiWeekScope] = useState<string[] | null>(null) // week starts to generate
  const [showMultiWeekDialog, setShowMultiWeekDialog] = useState(false)
  const [showCopyConfirm, setShowCopyConfirm] = useState(false)
  const [prevWeekHasRota, setPrevWeekHasRota] = useState(false)
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

  // Share capture ref
  const mobileContentRef = useRef<HTMLDivElement>(null)

  // Mobile edit mode state
  const [mobileEditMode, setMobileEditMode] = useState(false)
  const [preEditSnapshot, setPreEditSnapshot] = useState<RotaWeekData | null>(null)
  const [mobileCompact, setMobileCompact] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem("labrota_mobile_compact") !== "false"
  })
  const [mobileDeptColor, setMobileDeptColor] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem("labrota_mobile_dept_color") !== "false"
  })
  const [mobileViewMode, setMobileViewMode] = useState<"shift" | "person">("shift")
  const [mobileAddSheet, setMobileAddSheet] = useState<{ open: boolean; role: string }>({ open: false, role: "" })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [monthViewMode, setMonthViewMode] = useState<"shift" | "person">(() => {
    if (typeof window === "undefined") return "shift"
    return (localStorage.getItem("labrota_month_view") as "shift" | "person") ?? "shift"
  })

  // Department filter — persisted in localStorage
  // Dynamic department data from weekData (or defaults) — memoised to avoid re-creating every render
  const departments = weekData?.departments ?? []
  const globalDeptMaps = useMemo(() => buildDeptMaps(departments), [departments])
  const ALL_DEPTS = useMemo(() =>
    departments.length > 0 ? departments.map((d) => d.code) : ["lab", "andrology", "admin"],
    [departments]
  )
  const deptAbbrMap = useMemo(() => Object.fromEntries(
    departments.length > 0
      ? departments.map((d) => [d.code, d.abbreviation || d.name.slice(0, 3)])
      : [["lab", "Emb"], ["andrology", "And"], ["admin", "Adm"]]
  ), [departments])
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set(ALL_DEPTS))
  // Reset filter when org departments change
  useEffect(() => { setDeptFilter(new Set(ALL_DEPTS)) }, [ALL_DEPTS])
  const allDeptsSelected = deptFilter.size >= ALL_DEPTS.length
  function toggleDept(dept: string) {
    setDeptFilter((prev) => {
      const next = new Set(prev)
      next.has(dept) ? next.delete(dept) : next.add(dept)
      return next
    })
  }
  function setAllDepts() {
    setDeptFilter(new Set(ALL_DEPTS))
  }
  function setOnlyDept(dept: string) {
    const next = new Set([dept])
    setDeptFilter(next)
    localStorage.setItem("labrota_dept_filter", JSON.stringify([dept]))
  }

  // Filtered staff list based on department filter
  const filteredStaffList = allDeptsSelected ? staffList : staffList.filter((s) => deptFilter.has(s.role))
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
  const fetchVersionRef = useRef(0)
  const fetchWeek = useCallback((ws: string) => {
    const version = ++fetchVersionRef.current
    setLoadingWeek(true)
    setLiveDays(null)
    setError(null)
    // Don't clear weekData — keep showing previous data as background while loading
    // This prevents the empty flash between shimmer and content
    getRotaWeek(ws).then((d) => {
      if (fetchVersionRef.current !== version) return
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
      setLoadingWeek(false)
    }).catch((e: unknown) => {
      if (fetchVersionRef.current !== version) return
      setWeekData(null)
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

  // Fetch 4-week rolling summary
  const fetchMonth = useCallback((ms: string, ws?: string) => {
    setMonthSummary(null)
    setLoadingMonth(true)
    getRotaMonthSummary(ms, ws).then((d) => {
      setMonthSummary(d)
      setLoadingMonth(false)
    })
  }, [])

  useEffect(() => { fetchWeek(weekStart) }, [weekStart, fetchWeek])


  // Check if previous week has a rota (for "copy previous week" button)
  // Don't reset to false while loading — keep the last known value
  useEffect(() => {
    let cancelled = false
    const prev = new Date(weekStart + "T12:00:00")
    prev.setDate(prev.getDate() - 7)
    const prevWs = prev.toISOString().split("T")[0]
    getRotaWeek(prevWs).then((d) => {
      if (!cancelled) setPrevWeekHasRota(d.days.some((day) => day.assignments.length > 0))
    }).catch(() => { if (!cancelled) setPrevWeekHasRota(false) })
    return () => { cancelled = true }
  }, [weekStart])
  useEffect(() => {
    if (view === "month") fetchMonth(monthStart, weekStart)
  }, [monthStart, weekStart, view, fetchMonth])

  useEffect(() => {
    if (refreshKey === 0) return
    fetchWeek(weekStart)
    if (view === "month") fetchMonth(monthStart, weekStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useEffect(() => {
    getActiveStaff().then(setStaffList)
  }, [refreshKey])

  // Navigation — both views move by 1 week
  function navigate(dir: -1 | 1) {
    setShowStrategyModal(false)
    const days = view === "month" ? 28 : 7
    setCurrentDate((d) => addDays(d, dir * days))
  }

  function goToToday() {
    setCurrentDate(TODAY)
    setShowStrategyModal(false)
  }

  // Generate / publish / unlock
  function handleGenerateClick() {
    if (view === "month" && monthSummary) {
      // 4-week view: check which weeks have rotas
      const allWeekStarts: string[] = []
      for (let i = 0; i < (monthSummary.days.length ?? 0); i += 7) {
        if (monthSummary.days[i]) allWeekStarts.push(monthSummary.days[i].date)
      }
      const withRota = new Set(
        monthSummary.weekStatuses.filter((ws) => ws.status !== null).map((ws) => ws.weekStart)
      )
      const withoutRota = allWeekStarts.filter((ws) => !withRota.has(ws))

      if (withoutRota.length === allWeekStarts.length) {
        // NO weeks have rota — go straight to strategy for all
        setMultiWeekScope(allWeekStarts)
        setShowStrategyModal(true)
      } else if (withoutRota.length > 0) {
        // SOME weeks missing — show scope dialog
        setShowMultiWeekDialog(true)
      } else {
        // ALL weeks have rota — show scope dialog (regenerate confirmation)
        setShowMultiWeekDialog(true)
      }
      return
    }
    setShowStrategyModal(true)
  }

  function handleStrategyGenerate(strategy: GenerationStrategy, templateId?: string) {
    setShowStrategyModal(false)
    const weeksToGenerate = multiWeekScope ?? [weekStart]
    setMultiWeekScope(null)

    setLoadingWeek(true)
    startTransition(async () => {
      try {
        let successCount = 0
        let errorMsg: string | null = null

        for (const ws of weeksToGenerate) {
          if (strategy === "manual") {
            const result = await clearWeek(ws)
            if (result.error) { errorMsg = result.error; break }
            successCount++
          } else if ((strategy === "strict_template" || strategy === "flexible_template") && templateId) {
            const result = await applyTemplate(templateId, ws, strategy === "strict_template")
            if (result.error) { errorMsg = result.error; break }
            successCount++
          } else {
            const result = await generateRota(ws, false, "ai_optimal")
            if (result.error) { errorMsg = result.error; break }
            successCount++
          }
        }

        if (errorMsg) {
          setError(errorMsg)
          toast.error(errorMsg)
        } else if (weeksToGenerate.length > 1) {
          toast.success(t("weeksGenerated", { count: successCount }))
        } else {
          toast.success(t("scheduleGenerated"))
        }

        fetchWeek(weekStart)
        if (view === "month") fetchMonth(monthStart, weekStart)
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("generatingError")
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
        toast.warning(t("coverageInsufficient"))
      } else if (newGaps.length === 0 && prevGaps.length > 0) {
        toast.success(t("coverageOk"))
      }
    })
  }

  const rota           = weekData?.rota ?? null
  const isPublished    = rota?.status === "published"
  const isDraft        = rota?.status === "draft"
  const hasAssignments = weekData?.days.some((d) => d.assignments.length > 0) ?? false
  const hasSkillGaps   = hasAssignments && (weekData?.days.some((d) => d.skillGaps.length > 0) ?? false)
  // Show task assignment UI only in by_task mode, or in by_shift when the feature flag is on
  const showTaskAssignment = weekData?.rotaDisplayMode === "by_task" || (weekData?.enableTaskInShift ?? false)
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null
  const showActions    = canEdit

  const sheetDay = sheetDate ? (weekData?.days.find((d) => d.date === sheetDate) ?? null) : null


  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Desktop toolbar — LEFT · CENTRE (absolute) · RIGHT */}
      <div className="hidden lg:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background relative">

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
                  "rounded-md px-3 py-1 text-[13px] transition-colors min-w-[72px] text-center",
                  view === v
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:bg-muted font-medium"
                )}
              >
                {t(`${v}View`)}
              </button>
            ))}
          </div>
          {(view === "week" || view === "month") && (
            <>
              <span className="h-4 border-l border-border" />
              <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      onClick={() => { setCalendarLayout("shift"); setMonthViewMode("shift"); localStorage.setItem("labrota_month_view", "shift") }}
                      className={cn(
                        "rounded-md w-[36px] h-[28px] flex items-center justify-center transition-colors",
                        (view === "week" ? calendarLayout === "shift" : monthViewMode === "shift")
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {weekData?.rotaDisplayMode === "by_task"
                        ? <Grid3X3 className="size-[14px]" />
                        : <Rows3 className="size-[14px]" />
                      }
                    </button>
                  } />
                  <TooltipContent side="bottom">{weekData?.rotaDisplayMode === "by_task" ? t("byTask") : t("shiftLayout")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      onClick={() => { setCalendarLayout("person"); setMonthViewMode("person"); localStorage.setItem("labrota_month_view", "person") }}
                      className={cn(
                        "rounded-md w-[36px] h-[28px] flex items-center justify-center transition-colors",
                        (view === "week" ? calendarLayout === "person" : monthViewMode === "person")
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Users className="size-[14px]" />
                    </button>
                  } />
                  <TooltipContent side="bottom">{t("personLayout")}</TooltipContent>
                </Tooltip>
              </div>
            </>
          )}
        </div>

        {/* RIGHT: dept filter · warnings · generate · overflow ··· */}
        <div className="flex items-center gap-2 shrink-0">
          {view === "week" && hasAssignments && (
            <div className="hidden lg:block">
              <DepartmentFilterDropdown
                selected={deptFilter}
                allDepts={ALL_DEPTS}
                onToggle={toggleDept}
                onSetAll={setAllDepts}
                onSetOnly={setOnlyDept}
                deptLabels={globalDeptMaps.label}
                deptColors={globalDeptMaps.border}
                deptAbbr={deptAbbrMap}
              />
            </div>
          )}
          {weekData && hasAssignments && (
            <WarningsPill days={weekData.days} staffList={filteredStaffList} />
          )}
          {showActions && !isPublished && (
            <Button variant="outline" size="sm" onClick={handleGenerateClick} disabled={isPending} className="h-8 shrink-0">
              {isPending ? tc("generating") : hasAssignments ? t("regenerateRota") : t("generateRota")}
            </Button>
          )}
          {(showActions || hasAssignments) && (
            <OverflowMenu items={[
              // ── Group 1: Actions (publish) ──
              ...(canEdit && isDraft && hasAssignments && view === "week" ? [{
                label: t("publishRota"),
                icon: <Lock className="size-3.5" />,
                onClick: handlePublish,
                disabled: isPending,
              }] : []),
              ...(canEdit && isPublished && view === "week" ? [{
                label: t("unlockRota"),
                icon: <Lock className="size-3.5" />,
                onClick: handleUnlock,
                disabled: isPending,
              }] : []),
              // ── Group 2: Export ──
              ...(hasAssignments && view === "week" ? [{
                label: t("exportPdf"),
                icon: <FileText className="size-3.5" />,
                dividerBefore: true,
                onClick: () => {
                  if (!weekData) return
                  import("@/lib/export-pdf").then(({ exportPdfByShift, exportPdfByTask }) => {
                    const on = document.querySelector("[data-org-name]")?.textContent ?? "LabRota"
                    if (weekData.rotaDisplayMode === "by_task") {
                      exportPdfByTask(weekData, weekData.tecnicas ?? [], on, locale)
                    } else {
                      exportPdfByShift(weekData, on, locale)
                    }
                  })
                },
              }, {
                label: t("exportExcel"),
                icon: <Sheet className="size-3.5" />,
                onClick: () => {
                  if (!weekData) return
                  import("@/lib/export-excel").then(({ exportWeekByShift, exportWeekByTask }) => {
                    if (weekData.rotaDisplayMode === "by_task") {
                      exportWeekByTask(weekData, weekData.tecnicas ?? [], locale)
                    } else {
                      exportWeekByShift(weekData, locale)
                    }
                  })
                },
              }] : []),
              // ── Group 3: View options ──
              ...((view === "week" || view === "month") ? [{
                label: t("compactView"),
                icon: <Rows3 className="size-3.5" />,
                onClick: () => setCompact((c) => !c),
                active: compact,
                dividerBefore: true,
              }, {
                label: t("staffColors"),
                icon: <span className="size-3.5 rounded-full bg-gradient-to-br from-amber-400 via-blue-400 to-emerald-400 shrink-0" />,
                onClick: () => { const next = !colorChips; setColorChips(next); localStorage.setItem("labrota_color_chips", String(next)) },
                active: colorChips,
              }, {
                label: t("highlightPerson"),
                icon: <span className="size-3.5 rounded-sm shrink-0" style={{ backgroundColor: "#FDE047" }} />,
                onClick: () => setHighlightHover(!highlightHover),
                active: highlightHover,
              },
              ...(view === "week" ? [{
                label: t("daysAsRows"),
                icon: <Grid3X3 className="size-3.5" />,
                onClick: () => { const next = !daysAsRows; setDaysAsRows(next); localStorage.setItem("labrota_days_as_rows", String(next)) },
                active: daysAsRows,
              }] : [])] : []),
              // ── Group 4: Templates (week view, editors only) ──
              ...(view === "week" && canEdit && hasAssignments && !isPublished ? [{
                label: t("saveAsTemplate"),
                icon: <BookmarkPlus className="size-3.5" />,
                onClick: () => setSaveTemplateOpen(true),
                dividerBefore: true,
              }, {
                label: t("applyTemplate"),
                icon: <BookmarkCheck className="size-3.5" />,
                onClick: () => setApplyTemplateOpen(true),
              }] : view === "week" && canEdit ? [{
                label: t("applyTemplate"),
                icon: <BookmarkCheck className="size-3.5" />,
                onClick: () => setApplyTemplateOpen(true),
                dividerBefore: true,
              }] : []),
              // ── Group 4b: History (week view with assignments) ──
              ...(view === "week" && hasAssignments ? [{
                label: t("viewHistory"),
                icon: <Clock className="size-3.5" />,
                onClick: () => setHistoryOpen(true),
              }] : []),
              // ── Group 5: Destructive (editors only) ──
              ...(canEdit && hasAssignments && !isPublished ? [{
                label: view === "month" ? t("delete4Weeks") : t("deleteRota"),
                icon: <Trash2 className="size-3.5" />,
                onClick: () => {
                  const msg = view === "month"
                    ? t("confirm4WeeksDelete")
                    : t("deleteWeekConfirm")
                  if (confirm(msg)) {
                    startTransition(async () => {
                      if (view === "month" && monthSummary) {
                        const allWeekStarts: string[] = []
                        for (let i = 0; i < monthSummary.days.length; i += 7) {
                          if (monthSummary.days[i]) allWeekStarts.push(monthSummary.days[i].date)
                        }
                        let errors = 0
                        for (const ws of allWeekStarts) {
                          const result = await clearWeek(ws)
                          if (result.error) errors++
                        }
                        if (errors > 0) toast.error(t("weeksWithErrors", { count: errors }))
                        else toast.success(t("fourWeeksDeleted"))
                        fetchWeek(weekStart)
                        fetchMonth(monthStart, weekStart)
                      } else {
                        const result = await clearWeek(weekStart)
                        if (result.error) toast.error(result.error)
                        else { toast.success(t("rotaDeleted")); fetchWeek(weekStart) }
                      }
                    })
                  }
                },
                dividerBefore: true,
                destructive: true,
              }] : []),
            ]} />
          )}
        </div>
      </div>

      {/* Old mobile toolbar removed — replaced by compact toolbar inside the mobile day view section */}

      {/* Banners */}
      <div className="flex flex-col gap-2 px-4 pt-2 empty:hidden shrink-0">
        {isPublished && view === "week" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 flex items-center gap-2">
            <Lock className="size-3.5 text-emerald-600 shrink-0" />
            <span className="text-[13px] text-emerald-700">
              {rota?.published_at
                ? t("rotaPublishedBy", {
                    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(rota.published_at)),
                    author: rota.published_by ?? "—",
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
          <div className="hidden lg:flex flex-col flex-1 min-h-0 px-4 py-2 gap-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative" style={{ minHeight: 400 }}>
              {/* Shimmer — replaces content during loading */}
              {loadingWeek && (
                <div className="absolute inset-0 z-10 bg-background">
                  <ShiftGrid data={null} staffList={[]} loading locale={locale} onCellClick={() => {}} onChipClick={() => {}} isPublished={false} shiftTimes={null} onLeaveByDate={{}} publicHolidays={{}} punctionsDefault={{}} punctionsOverride={{}} onPunctionsChange={() => {}} onRefresh={() => {}} weekStart={weekStart} compact={compact} colorChips={colorChips} />
                </div>
              )}
              {weekData && (weekData.rotaDisplayMode === "by_task" && daysAsRows ? (
                <TransposedTaskGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  compact={compact}
                  onRemoveAssignment={async (id) => {
                    const result = await removeAssignment(id)
                    if (result.error) toast.error(result.error)
                    else fetchWeekSilent(weekStart)
                  }}
                  onCellClick={(date, tecCode) => {
                    // Open assignment sheet for this day with the tecnica pre-selected
                    setSheetDate(date)
                    setSheetOpen(true)
                  }}
                />
              ) : weekData.rotaDisplayMode === "by_task" ? (
                /* By task: always show TaskGrid — it handles its own empty state */
                <TaskGrid
                  data={weekData}
                  staffList={staffList}
                  loading={false}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  onRefresh={() => fetchWeekSilent(weekStart)}
                  taskConflictThreshold={weekData?.taskConflictThreshold ?? 3}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={handlePunctionsChange}
                  biopsyConversionRate={weekData?.biopsyConversionRate}
                  biopsyDay5Pct={weekData?.biopsyDay5Pct}
                  biopsyDay6Pct={weekData?.biopsyDay6Pct}
                  shiftLabel={weekData?.shiftTypes?.[0] ? `${weekData.shiftTypes[0].start_time} – ${weekData.shiftTypes[0].end_time}` : undefined}
                  compact={compact}
                  colorBorders={colorChips}
                />
              ) : (!weekData.rota || !weekData.days.some((d) => d.assignments.length > 0)) ? (
                <div className="relative flex-1">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-5 w-full max-w-[420px]">
                    <Sparkles className="size-12" style={{ color: "#2C3E6B" }} />
                    <div className="text-center">
                      <p className="text-[18px] font-semibold" style={{ color: "#2C3E6B" }}>Semana sin horario</p>
                      <p className="text-[14px] text-muted-foreground mt-2 max-w-[380px] mx-auto leading-relaxed">
                        El generador tiene en cuenta turnos, coberturas mínimas, preferencias del equipo y ausencias. Listo en segundos.
                      </p>
                    </div>
                    {!showCopyConfirm ? (
                      <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={handleGenerateClick} className="gap-1.5">
                          <Sparkles className="size-3.5" />
                          {t("generateRota")}
                        </Button>
                        {prevWeekHasRota && (
                          <Button variant="outline" onClick={() => setShowCopyConfirm(true)} className="gap-1.5">
                            <Copy className="size-3.5" />
                            {t("copyPrevWeek")}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 w-full">
                        <p className="text-[13px] text-amber-600 dark:text-amber-400 font-medium mb-1">{t("copyPrevWeekConfirmTitle")}</p>
                        <p className="text-[12px] text-amber-600 dark:text-amber-400 mb-3">{t("copyPrevWeekConfirmBody")}</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => {
                            setShowCopyConfirm(false)
                            setLoadingWeek(true)
                            startTransition(async () => {
                              const result = await copyPreviousWeek(weekStart)
                              if (result.error) { toast.error(result.error); return }
                              toast.success(t("copyAssignments", { count: result.count ?? 0 }))
                              fetchWeek(weekStart)
                            })
                          }}>
                            {t("copy")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowCopyConfirm(false)}>{tc("cancel")}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : calendarLayout === "shift" && daysAsRows ? (
                <TransposedShiftGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  compact={compact}
                  colorChips={colorChips}
                  timeFormat={weekData?.timeFormat}
                  onChipClick={(a) => openProfile(a.staff_id)}
                  onRefresh={() => fetchWeekSilent(weekStart)}
                />
              ) : calendarLayout === "shift" ? (
                <ShiftGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  loading={false}
                  isGenerating={isPending}
                  locale={locale}
                  onCellClick={() => {}}
                  onChipClick={(a) => openProfile(a.staff_id)}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={handlePunctionsChange}
                  onRefresh={() => fetchWeekSilent(weekStart)}
                  weekStart={weekStart}
                  compact={compact}
                  colorChips={colorChips}
                  onDateClick={handleMonthDayClick}
                  onLocalDaysChange={setLiveDays}
                  ratioOptimal={weekData?.ratioOptimal}
                  ratioMinimum={weekData?.ratioMinimum}
                  timeFormat={weekData?.timeFormat}
                  biopsyConversionRate={weekData?.biopsyConversionRate}
                  biopsyDay5Pct={weekData?.biopsyDay5Pct}
                  biopsyDay6Pct={weekData?.biopsyDay6Pct}
                />
              ) : calendarLayout === "person" && daysAsRows ? (
                <TransposedPersonGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onChipClick={(a) => openProfile(a.staff_id)}
                  onDateClick={handleMonthDayClick}
                  colorChips={colorChips}
                  compact={compact}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
                />
              ) : (
                <PersonGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  loading={false}
                  isGenerating={isPending}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onChipClick={(a) => openProfile(a.staff_id)}
                  onDateClick={handleMonthDayClick}
                  colorChips={colorChips}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        )}

        {/* Month view */}
        {view === "month" && (
          <div className="hidden md:block overflow-auto flex-1 px-4 py-3">
            <MonthGrid
              summary={monthSummary}
              loading={loadingMonth}
              locale={locale}
              currentDate={currentDate}
              onSelectDay={handleMonthDayClick}
              onSelectWeek={(ws) => { setCurrentDate(ws); setView("week") }}
              firstDayOfWeek={weekData?.firstDayOfWeek ?? 0}
              punctionsOverride={punctionsOverride}
              onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
              monthViewMode={monthViewMode}
            />
          </div>
        )}

        {/* Mobile: viewer personal schedule */}
        {!canEdit && viewerStaffId && weekData && (
          <MySchedule
            staffId={viewerStaffId}
            days={weekData.days}
            onLeaveByDate={weekData.onLeaveByDate ?? {}}
            shiftTimes={weekData.shiftTimes ?? null}
            tecnicas={weekData.tecnicas ?? []}
            locale={locale as "es" | "en"}
            timeFormat={weekData.timeFormat}
            initialDate={currentDate}
          />
        )}

        {/* Mobile: admin/editor day view */}
        <div className={cn("flex flex-col overflow-auto lg:hidden flex-1", !canEdit && "hidden")}>
          {/* Date carousel — hidden in edit mode */}
          {!mobileEditMode && weekData && (
            <WeeklyStrip
              days={weekData.days.map((d) => ({
                date: d.date,
                staffCount: d.assignments.length,
                hasSkillGaps: d.skillGaps.length > 0 || d.warnings.length > 0,
              }))}
              currentDate={currentDate}
              onSelectDay={(date) => { setCurrentDate(date); setMobileEditMode(false) }}
              locale={locale as "es" | "en"}
            />
          )}
          {/* Sticky toolbar */}
          {mobileEditMode ? (
            <div data-mobile-toolbar className="flex items-center justify-between h-[68px] px-4 bg-primary text-primary-foreground border-b border-primary lg:hidden sticky top-0 z-20">
              <span className="text-[16px] font-semibold">
                {currentDayData ? formatDate(currentDayData.date, locale as "es" | "en") : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    // Undo: restore snapshot and re-fetch server state
                    if (preEditSnapshot) {
                      setWeekData(preEditSnapshot)
                    }
                    setMobileEditMode(false)
                    setPreEditSnapshot(null)
                    fetchWeekSilent(weekStart)
                  }}
                  className="h-10 px-4 text-[13px] font-medium text-primary-foreground/70 active:text-primary-foreground rounded-lg"
                >
                  {tc("cancel")}
                </button>
                <Button size="sm" variant="secondary" onClick={() => { setMobileEditMode(false); setPreEditSnapshot(null) }} className="h-10 px-5 text-[14px]">
                  {locale === "es" ? "Listo" : "Done"}
                </Button>
              </div>
            </div>
          ) : (
            <div data-mobile-toolbar className="flex items-center gap-1 h-12 px-2 border-b border-border bg-background lg:hidden sticky top-0 z-20">
              {/* Left: date selector */}
              <button onClick={() => setCurrentDate((d) => addDays(d, -1))} className="size-8 flex items-center justify-center rounded-full active:bg-accent shrink-0">
                <ChevronLeft className="size-4 text-muted-foreground" />
              </button>
              <div className="relative shrink-0">
                <input
                  type="date"
                  value={currentDate}
                  onChange={(e) => { if (e.target.value) setCurrentDate(e.target.value) }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <span className="text-[14px] font-semibold capitalize pointer-events-none">
                  {currentDayData ? formatDate(currentDayData.date, locale as "es" | "en") : formatDate(currentDate, locale as "es" | "en")}
                </span>
              </div>
              <button onClick={() => setCurrentDate((d) => addDays(d, 1))} className="size-8 flex items-center justify-center rounded-full active:bg-accent shrink-0">
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
              <button
                onClick={goToToday}
                disabled={currentDate === TODAY}
                className={cn("text-[12px] font-medium px-1.5 py-1 rounded-md transition-colors shrink-0", currentDate === TODAY ? "text-muted-foreground/30" : "text-primary active:bg-primary/10")}
              >
                {tc("today")}
              </button>
              <div className="flex-1" />
              {/* Warnings pill */}
              {weekData && (
                <WarningsPill days={weekData?.days ?? []} staffList={staffList} />
              )}
              {canEdit && (
                <button onClick={() => { setPreEditSnapshot(weekData ? JSON.parse(JSON.stringify(weekData)) : null); setMobileEditMode(true) }} className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent shrink-0">
                  <Pencil className="size-3.5" />
                </button>
              )}
              {canEdit && (
                <MobileOverflow
                  onGenerateWeek={() => setShowStrategyModal(true)}
                  onGenerateDay={currentDayData ? async () => {
                    const result = await regenerateDay(weekStart, currentDate)
                    if (result.error) toast.error(result.error)
                    else { toast.success(locale === "es" ? "Día regenerado" : "Day regenerated"); fetchWeekSilent(weekStart) }
                  } : undefined}
                  onShare={async () => {
                    if (!mobileContentRef.current) return
                    const { shareCapture } = await import("@/lib/share-capture")
                    await shareCapture(mobileContentRef.current, `rota-${currentDate.replace(/-/g, "")}.png`)
                  }}
                  isPending={isPending}
                  compact={mobileCompact}
                  onToggleCompact={() => { const next = !mobileCompact; setMobileCompact(next); localStorage.setItem("labrota_mobile_compact", String(next)) }}
                  deptColor={mobileDeptColor}
                  onToggleDeptColor={() => { const next = !mobileDeptColor; setMobileDeptColor(next); localStorage.setItem("labrota_mobile_dept_color", String(next)) }}
                  highlight={highlightHover}
                  onToggleHighlight={() => setHighlightHover(!highlightHover)}
                />
              )}
            </div>
          )}
          <div
            ref={mobileContentRef}
            className="flex flex-col gap-4 px-4 py-3 flex-1 pb-32"
            onTouchStart={(e) => { (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX) }}
            onTouchEnd={(e) => {
              const startX = Number((e.currentTarget as HTMLElement).dataset.touchX ?? 0)
              const dx = e.changedTouches[0].clientX - startX
              if (Math.abs(dx) > 80) setCurrentDate((d) => addDays(d, dx < 0 ? 1 : -1))
            }}
          >
            {weekData?.rotaDisplayMode === "by_task" && weekData.tecnicas ? (
              <MobileTaskDayView
                day={currentDayData}
                tecnicas={weekData.tecnicas}
                departments={weekData.departments ?? []}
                data={weekData}
                staffList={staffList}
                isEditMode={mobileEditMode}
                onRemoveAssignment={async (id) => {
                  // Optimistic remove
                  setWeekData((prev) => {
                    if (!prev) return prev
                    return { ...prev, days: prev.days.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== id) })) }
                  })
                  const result = await removeAssignment(id)
                  if (result.error) { toast.error(result.error); fetchWeekSilent(weekStart) }
                }}
                onAddToTask={(tecCode) => setMobileAddSheet({ open: true, role: "lab" })}
                loading={loadingWeek || !currentDayData}
                locale={locale}
              />
            ) : (
              <DayView
                day={currentDayData}
                loading={loadingWeek || !currentDayData}
                locale={locale}
                departments={weekData?.departments ?? []}
                data={weekData}
                isEditMode={mobileEditMode}
                onRemoveAssignment={async (id) => {
                  // Optimistic: remove from local state immediately
                  setWeekData((prev) => {
                    if (!prev) return prev
                    return { ...prev, days: prev.days.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== id) })) }
                  })
                  const result = await removeAssignment(id)
                  if (result.error) { toast.error(result.error); fetchWeekSilent(weekStart) }
                }}
                onAddStaff={(role) => setMobileAddSheet({ open: true, role })}
                staffList={staffList}
                mobileCompact={mobileCompact}
                mobileDeptColor={mobileDeptColor}
              />
            )}
          </div>
        </div>

        {/* Mobile add staff sheet */}
        {(() => {
          const deptMap = Object.fromEntries((weekData?.departments ?? []).filter((d) => !d.parent_id).map((d) => [d.code, d.name]))
          const assignedIds = new Set(currentDayData?.assignments.map((a) => a.staff_id) ?? [])
          const leaveIds = new Set(currentDayData ? (weekData?.onLeaveByDate?.[currentDayData.date] ?? []) : [])
          // Compute weekly assignment counts
          const weeklyCounts: Record<string, number> = {}
          for (const d of weekData?.days ?? []) {
            for (const a of d.assignments) {
              weeklyCounts[a.staff_id] = (weeklyCounts[a.staff_id] ?? 0) + 1
            }
          }
          return (
            <MobileAddStaffSheet
              open={mobileAddSheet.open}
              onOpenChange={(open) => setMobileAddSheet((s) => ({ ...s, open }))}
              departmentCode={mobileAddSheet.role}
              departmentName={deptMap[mobileAddSheet.role] ?? mobileAddSheet.role}
              date={currentDate}
              weekStart={weekStart}
              staffList={staffList}
              assignedStaffIds={assignedIds}
              onLeaveStaffIds={leaveIds}
              shiftTypes={weekData?.shiftTypes ?? []}
              weeklyAssignmentCounts={weeklyCounts}
              onAdded={() => fetchWeekSilent(weekStart)}
            />
          )
        })()}
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
        departments={weekData?.departments ?? []}
        punctionsDefault={sheetDate ? (weekData?.punctionsDefault[sheetDate] ?? 0) : 0}
        punctionsOverride={punctionsOverride}
        rota={weekData?.rota ?? null}
        isPublished={!!isPublished || !canEdit}
        onSaved={() => { fetchWeek(weekStart); if (view === "month") fetchMonth(monthStart, weekStart) }}
        onPunctionsChange={handlePunctionsChange}
        timeFormat={weekData?.timeFormat}
        biopsyForecast={(() => {
          if (!sheetDate || !weekData) return 0
          const pd = weekData.punctionsDefault
          function getPunc(dateStr: string): number {
            if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
            if (pd[dateStr] !== undefined) return pd[dateStr]
            const dow = new Date(dateStr + "T12:00:00").getDay()
            const sameDow = Object.entries(pd).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
            return sameDow ? sameDow[1] : 0
          }
          const d5 = new Date(sheetDate + "T12:00:00"); d5.setDate(d5.getDate() - 5)
          const d6 = new Date(sheetDate + "T12:00:00"); d6.setDate(d6.getDate() - 6)
          const cr = weekData.biopsyConversionRate ?? 0.5
          return Math.round(getPunc(d5.toISOString().split("T")[0]) * cr * (weekData.biopsyDay5Pct ?? 0.5) + getPunc(d6.toISOString().split("T")[0]) * cr * (weekData.biopsyDay6Pct ?? 0.5))
        })()}
        rotaDisplayMode={weekData?.rotaDisplayMode}
        taskConflictThreshold={weekData?.taskConflictThreshold}
      />

      {/* Multi-week generation scope dialog */}
      {showMultiWeekDialog && monthSummary && (() => {
        const allWeekStarts: string[] = []
        for (let i = 0; i < monthSummary.days.length; i += 7) {
          if (monthSummary.days[i]) allWeekStarts.push(monthSummary.days[i].date)
        }
        const withRota = new Set(
          monthSummary.weekStatuses.filter((ws) => ws.status !== null).map((ws) => ws.weekStart)
        )
        const withoutRota = allWeekStarts.filter((ws) => !withRota.has(ws))
        const allHaveRota = withoutRota.length === 0

        return (
          <>
            <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setShowMultiWeekDialog(false)} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[380px] p-5 flex flex-col gap-4">
              <p className="text-[15px] font-medium">
                {allHaveRota ? t("regenerate4WeeksTitle") : t("generate4WeeksTitle")}
              </p>

              {allHaveRota ? (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    {t("overwriteWarning")}
                  </p>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowMultiWeekDialog(false)}>
                      {tc("cancel")}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => {
                      setShowMultiWeekDialog(false)
                      setMultiWeekScope(allWeekStarts)
                      setShowStrategyModal(true)
                    }}>
                      {t("regenerate4Weeks")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setShowMultiWeekDialog(false)
                        setMultiWeekScope(withoutRota)
                        setShowStrategyModal(true)
                      }}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-lg border border-primary bg-primary/5 text-left hover:bg-primary/10 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="text-[14px] font-medium">{t("generateWeeksWithout")}</p>
                        <p className="text-[12px] text-muted-foreground">{t("weeksWithoutSchedule", { count: withoutRota.length })}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setShowMultiWeekDialog(false)
                        setMultiWeekScope(allWeekStarts)
                        setShowStrategyModal(true)
                      }}
                      className="relative w-full px-4 py-3 rounded-lg border border-border text-left hover:bg-muted/50 transition-colors"
                    >
                      <AlertTriangle className="size-4 text-amber-500 absolute top-2.5 right-2.5" />
                      <p className="text-[14px] font-medium">{t("regenerateAllWeeks")}</p>
                      <p className="text-[12px] text-muted-foreground">{t("weeksOverwrite")}</p>
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowMultiWeekDialog(false)}>
                      {tc("cancel")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )
      })()}

      {/* Staff profile panel */}
      <StaffProfilePanel
        staffId={profileStaffId}
        staffList={staffList}
        weekData={weekData}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />

      {/* Rota history panel */}
      <RotaHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        weekStart={weekStart}
        date={currentDate}
        onRestored={() => fetchWeek(weekStart)}
      />

      {/* Week notes — desktop only */}
      <div className="hidden md:block">
        {view === "week" && <WeekNotes weekStart={weekStart} />}
      </div>

      {/* Bottom taskbar — desktop only, hidden for viewers */}
      <div className="hidden md:block">
        {canEdit && view === "week" && !weekData && loadingWeek && (
          <div className="shrink-0 h-11 bg-background border-t border-border flex items-center px-4 gap-2">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
          </div>
        )}
        {canEdit && view === "week" && weekData && (
          <ShiftBudgetBar
            data={weekData}
            staffList={filteredStaffList}
            weekLabel={formatToolbarLabel("week", currentDate, weekStart, locale)}
            onPillClick={openProfile}
            liveDays={weekData?.rotaDisplayMode === "by_task" ? null : liveDays}
            deptFilter={deptFilter}
          />
        )}
        {canEdit && view === "month" && monthSummary && !loadingMonth && (
          <MonthBudgetBar
            summary={monthSummary}
            monthLabel={formatToolbarLabel("month", currentDate, weekStart, locale)}
            onPillClick={openProfile}
          />
        )}
      </div>

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
        onApplied={() => { fetchWeek(weekStart); if (view === "month") fetchMonth(monthStart, weekStart) }}
      />
    </main>
  )
}
