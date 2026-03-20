"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Lock, FileDown } from "lucide-react"
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
  type RotaWeekData,
  type RotaDay,
  type RotaMonthSummary,
  type ShiftTimes,
} from "@/app/(clinic)/rota/actions"
import { AssignmentSheet } from "@/components/assignment-sheet"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"

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

const TODAY = new Date().toISOString().split("T")[0]

// ── Skill key map (DB key → i18n key) ─────────────────────────────────────────

const SKILL_KEYS: Record<string, string> = {
  icsi: "icsi", iui: "iui", vitrification: "vitrification", thawing: "thawing",
  biopsy: "biopsy", semen_analysis: "semenAnalysis", sperm_prep: "spermPrep",
  witnessing: "witnessing", egg_collection: "eggCollection", other: "other",
}

// ── Skill coverage dot colours ────────────────────────────────────────────────

const SKILL_COLORS: Record<string, string> = {
  icsi:           "bg-blue-500",
  iui:            "bg-cyan-500",
  vitrification:  "bg-violet-500",
  thawing:        "bg-sky-400",
  biopsy:         "bg-indigo-500",
  semen_analysis: "bg-emerald-500",
  sperm_prep:     "bg-green-600",
  witnessing:     "bg-amber-500",
  egg_collection: "bg-orange-500",
  other:          "bg-slate-400",
}

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

function ShiftBadge({ first, last, role, isOpu, isOverride }: {
  first: string; last: string; role: string; isOpu: boolean; isOverride: boolean
}) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium w-full",
      isOverride ? "border-primary/30 bg-primary/5" : "border-border bg-background"
    )}>
      <div className={cn(
        "size-4 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0",
        ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"
      )}>
        {first[0]?.toUpperCase()}{last[0]?.toUpperCase()}
      </div>
      <span className="truncate">{first} {last[0]}.</span>
      {isOpu && <span className="text-amber-500 shrink-0 text-[11px] leading-none" title="OPU">★</span>}
    </div>
  )
}

// ── Punctions input ────────────────────────────────────────────────────────────

function PunctionsInput({ date, value, isOverride, onChange, disabled }: {
  date: string; value: number; isOverride: boolean; onChange: (date: string, value: number | null) => void; disabled: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(String(value))

  useEffect(() => { setDraft(String(value)) }, [value])

  function commit() {
    setEditing(false)
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n >= 0) {
      onChange(date, n === 0 ? null : n)
    } else {
      setDraft(String(value))
    }
  }

  if (disabled) {
    return (
      <span className={cn("text-[11px] font-medium", isOverride ? "text-primary" : "text-muted-foreground")}>
        {value || "—"}
      </span>
    )
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(String(value)) } }}
        className="w-8 text-[11px] text-center border border-primary rounded px-0.5 outline-none bg-background"
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      className={cn(
        "text-[11px] font-medium rounded px-1 transition-colors hover:bg-muted",
        isOverride ? "text-primary" : "text-muted-foreground"
      )}
      title="Editar punciones"
    >
      {value > 0 ? value : "—"}
    </button>
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
    <div className="px-4 pb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground font-medium shrink-0">{t("shiftBudget")}:</span>
        {entries.map(([id, s]) => {
          const colorClass = s.count >= 5 ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : s.count >= 3 ? "bg-amber-50 border-amber-200 text-amber-700"
            : "bg-slate-50 border-slate-200 text-slate-500"
          return (
            <div
              key={id}
              className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium", colorClass)}
            >
              <div className={cn(
                "size-4 rounded-full flex items-center justify-center text-[8px] font-semibold",
                ROLE_COLORS[s.role] ?? "bg-muted text-muted-foreground"
              )}>
                {s.first[0]?.toUpperCase()}{s.last[0]?.toUpperCase()}
              </div>
              <span>{s.count}/5</span>
            </div>
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
        <span className="hidden sm:inline">Cobertura insuficiente</span>
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
                  <span className="text-[10px] text-muted-foreground">P</span>
                  <PunctionsInput
                    date={day.date}
                    value={effectiveP}
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
                {day.assignments.map((a) => (
                  <StaffChip
                    key={a.id}
                    first={a.staff.first_name}
                    last={a.staff.last_name}
                    role={a.staff.role}
                    isOverride={a.is_manual_override}
                    hasTrainee={!!a.trainee_staff_id}
                    isOpu={a.is_opu}
                    notes={a.notes}
                    shiftTime={shiftTimes ? `${shiftTimes[a.shift_type].start}–${shiftTimes[a.shift_type].end}` : undefined}
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

const SHIFT_ROWS: ShiftType[] = ["am", "pm", "full"]

function ShiftGrid({
  data, staffList, loading, locale,
  onCellClick, onChipClick,
  isPublished, isGenerating,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  onCellClick: (date: string, shiftType: ShiftType) => void
  onChipClick: (assignment: Assignment, date: string) => void
  isPublished: boolean
  isGenerating?: boolean
}) {
  const t  = useTranslations("schedule")
  const ts = useTranslations("skills")

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="rounded-lg border border-border overflow-hidden min-w-[560px] flex-1">
          {/* Header */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b">
            <div className="border-r h-14" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center py-2 border-r last:border-r-0 gap-1.5">
                <div className="shimmer-bar h-2.5 w-6" />
                <div className="shimmer-bar w-7 h-7 rounded-full" />
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((j) => <div key={j} className="shimmer-bar size-1.5 rounded-full" />)}
                </div>
              </div>
            ))}
          </div>
          {/* Rows */}
          {["am", "pm", "full", "off"].map((row) => (
            <div key={row} className={cn("grid grid-cols-[64px_repeat(7,1fr)]", row !== "off" && "border-b")}>
              <div className="border-r flex items-center justify-center py-3 bg-muted/20">
                <div className="shimmer-bar h-3 w-8" />
              </div>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="border-r last:border-r-0 p-2 flex flex-col gap-1 min-h-[52px]">
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

  const SHIFT_LABELS: Record<ShiftType, string> = {
    am:   "AM",
    pm:   "PM",
    full: t("shiftTypes.full"),
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-auto min-w-[560px] flex-1">
      {/* Header row */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b sticky top-0 bg-background z-10">
        <div className="border-r" />
        {data.days.map((day) => {
          const d     = new Date(day.date + "T12:00:00")
          const wday  = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayN  = String(d.getDate())
          const today = day.date === TODAY

          const assignedIds   = new Set(day.assignments.map((a) => a.staff_id))
          const coveredSkills = [...new Set([...assignedIds].flatMap((id) => staffSkillMap[id] ?? []))]

          return (
            <div key={day.date} className="flex flex-col items-center py-2 border-r last:border-r-0 gap-0.5">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide">{wday}</span>
              <div className={cn(
                "size-7 flex items-center justify-center rounded-full text-[14px] font-medium",
                today && "bg-primary text-primary-foreground"
              )}>
                {dayN}
              </div>
              {coveredSkills.length > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center max-w-[72px] px-1">
                  {coveredSkills.map((skill) => (
                    <Tooltip key={skill}>
                      <TooltipTrigger
                        render={
                          <span className={cn(
                            "size-1.5 rounded-full shrink-0 inline-block cursor-default",
                            SKILL_COLORS[skill] ?? "bg-slate-400"
                          )} />
                        }
                      />
                      <TooltipContent side="bottom">
                        {ts(SKILL_KEYS[skill] as Parameters<typeof ts>[0])}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* AM / PM / FULL rows */}
      {SHIFT_ROWS.map((shiftRow) => (
        <div key={shiftRow} className="grid grid-cols-[64px_repeat(7,1fr)] border-b">
          <div className="border-r flex items-center justify-center px-1 py-2 bg-muted/20">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {SHIFT_LABELS[shiftRow]}
            </span>
          </div>
          {data.days.map((day) => {
            const dayShifts = day.assignments.filter((a) => a.shift_type === shiftRow)
            return (
              <div
                key={day.date}
                className={cn(
                  "border-r last:border-r-0 p-1.5 flex flex-col gap-1 min-h-[52px]",
                  !isPublished && "cursor-pointer hover:bg-blue-50 transition-colors"
                )}
                onClick={() => { if (!isPublished) onCellClick(day.date, shiftRow) }}
              >
                {dayShifts.map((a) => (
                  <div
                    key={a.id}
                    onClick={(e) => { e.stopPropagation(); onChipClick(a, day.date) }}
                  >
                    <ShiftBadge
                      first={a.staff.first_name}
                      last={a.staff.last_name}
                      role={a.staff.role}
                      isOpu={a.is_opu ?? false}
                      isOverride={a.is_manual_override}
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ))}

      {/* Dashed divider before OFF row */}
      <div
        className="h-px"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, #ccddee 0, #ccddee 6px, transparent 6px, transparent 12px)",
          backgroundSize:  "12px 1px",
          backgroundRepeat: "repeat-x",
        }}
      />

      {/* OFF row */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)]">
        <div className="border-r flex items-center justify-center px-1 py-2 bg-muted/20">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">OFF</span>
        </div>
        {data.days.map((day) => {
          const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
          const offStaff    = staffList.filter((s) => !assignedIds.has(s.id))
          return (
            <div key={day.date} className="border-r last:border-r-0 p-1.5 flex flex-col gap-1 min-h-[40px]">
              {offStaff.map((s) => (
                <ShiftBadge
                  key={s.id}
                  first={s.first_name}
                  last={s.last_name}
                  role={s.role}
                  isOpu={false}
                  isOverride={false}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
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

  // Assignment sheet state
  const [sheetOpen, setSheetOpen]           = useState(false)
  const [sheetDate, setSheetDate]           = useState<string | null>(null)
  const [sheetEdit, setSheetEdit]           = useState<Assignment | null>(null)
  const [sheetDefaultShift, setSheetDefaultShift] = useState<ShiftType>("am")

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
        if (result.error) setError(result.error)
        else fetchWeek(weekStart)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate rota. Check the browser console for details.")
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

  function handleCellClick(date: string, shiftType: ShiftType = "am") {
    if (isPublished) return
    setSheetDate(date)
    setSheetEdit(null)
    setSheetDefaultShift(shiftType)
    setSheetOpen(true)
  }

  function handleChipClick(assignment: Assignment, date: string) {
    setSheetDate(date)
    setSheetEdit(assignment)
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
    setPunctionsOverrideLocal((prev) => {
      if (value === null) {
        const { [date]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [date]: value }
    })
    startTransition(async () => {
      const result = await setPunctionsOverride(weekData.rota!.id, date, value)
      if (result.error) setError(result.error)
    })
  }

  const rota           = weekData?.rota ?? null
  const isPublished    = rota?.status === "published"
  const isDraft        = rota?.status === "draft"
  const hasAssignments = weekData?.days.some((d) => d.assignments.length > 0) ?? false
  const hasSkillGaps   = hasAssignments && (weekData?.days.some((d) => d.skillGaps.length > 0) ?? false)
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null
  const showActions    = view !== "month"

  const assignedOnSheetDate = sheetDate
    ? (weekData?.days.find((d) => d.date === sheetDate)?.assignments ?? []).map((a) => a.staff_id)
    : []

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
      {/* Desktop toolbar */}
      <div className="hidden md:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background">
        {/* Left: nav + date label */}
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
          <span className="text-[14px] font-medium capitalize">
            {formatToolbarLabel(view, currentDate, weekStart, locale)}
          </span>
        </div>

        {/* Right: view toggle + layout toggle + actions */}
        <div className="flex items-center gap-2">
          {/* Period toggle: Semana | Mes | Día */}
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

          {/* Layout toggle (only in week view): Por turno | Por persona */}
          {view === "week" && (
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
          )}

          {hasSkillGaps && !isPublished && view !== "month" && (
            <SkillGapPill details={skillGapDetails} />
          )}

          {showActions && (
            <>
              {hasAssignments && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/rota/${weekStart}/print`, "_blank")}
                >
                  <FileDown className="size-3.5" />
                  {t("exportPdf")}
                </Button>
              )}
              {isPublished && (
                <Button variant="outline" size="sm" onClick={handleUnlock} disabled={isPending}>
                  <Lock className="size-3.5" />
                  {t("unlockRota")}
                </Button>
              )}
              {isDraft && hasAssignments && (
                <Button variant="outline" size="sm" onClick={handlePublish} disabled={isPending}>
                  {t("publishRota")}
                </Button>
              )}
              {!isPublished && (
                <Button size="sm" onClick={handleGenerateClick} disabled={isPending || loadingWeek}>
                  {isPending ? tc("generating") : hasAssignments ? t("regenerateRota") : t("generateRota")}
                </Button>
              )}
            </>
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
      <div className="flex flex-col gap-2 px-4 pt-3 empty:hidden shrink-0">
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
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* Week view */}
        {view === "week" && (
          <div className="hidden md:flex flex-col flex-1 min-h-0 px-4 py-3 gap-2">
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
            {weekData && calendarLayout === "person" && <ShiftBudgetBar data={weekData} />}
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

      {/* Assignment sheet */}
      <AssignmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        date={sheetDate}
        weekStart={weekStart}
        editAssignment={sheetEdit}
        staffList={staffList}
        assignedStaffIds={assignedOnSheetDate}
        onSaved={() => fetchWeek(weekStart)}
        isPublished={!!isPublished}
        locale={locale}
        defaultShiftType={sheetDefaultShift}
      />
    </main>
  )
}
