"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, Fragment } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { useCanEdit, useUserRole } from "@/lib/role-context"
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Lock, FileDown, FileText, Sheet, CalendarX, MoreHorizontal, X, UserCog, CalendarPlus, Mail, Rows3, BookmarkPlus, BookmarkCheck, Sparkles, Grid3X3, BookmarkX, Bookmark, Briefcase, Check, CheckCircle2, Hourglass, Filter, LayoutList, Plane, Trash2, Pencil, Users, Clock, Cross, User, GraduationCap, Baby, Share, Copy, Star, ArrowRightLeft, ChevronUp, ChevronDown, Image, BrainCircuit, Minus, Plus, Undo2, Redo2 } from "lucide-react"
import { toast } from "sonner"
import { DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { getUserPreferences, saveUserPreferences } from "@/app/(clinic)/account-actions"
import {
  getRotaWeek,
  getRotaMonthSummary,
  generateRota,
  generateRotaWithAI,
  publishRota,
  unlockRota,
  getActiveStaff,
  moveAssignment,
  setPunctionsOverride,
  moveAssignmentShift,
  removeAssignment,
  deleteAssignment,
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
  generateRotaHybrid,
  getHybridUsage,
} from "@/app/(clinic)/rota/actions"
import type { RotaTemplate } from "@/lib/types/database"
import { formatDate, formatDateRange, formatDateWithYear } from "@/lib/format-date"
import { formatTime } from "@/lib/format-time"
import { AssignmentSheet } from "@/components/assignment-sheet"
import { quickCreateLeave } from "@/app/(clinic)/leaves/actions"
import { bulkAddSkill, bulkRemoveSkill, bulkUpdateStaffField } from "@/app/(clinic)/staff/actions"
import { WeeklyStrip } from "@/components/weekly-strip"
import { MobileEditToolbar } from "@/components/mobile-edit-toolbar"
import { MobileAddStaffSheet } from "@/components/mobile-add-staff-sheet"
import { MobileTaskView } from "@/components/mobile-task-view"
import { MobileTaskDayView } from "@/components/mobile-task-day-view"
import { TapPopover } from "@/components/tap-popover"
import { MobilePersonView } from "@/components/mobile-person-view"
import { TransposedShiftGrid } from "@/components/transposed-shift-grid"
import { TransposedTaskGrid } from "@/components/transposed-task-grid"
import { TaskPersonGrid } from "@/components/task-person-grid"
import dynamic from "next/dynamic"
const RotaHistoryPanel = dynamic(() => import("@/components/rota-history-panel").then((m) => m.RotaHistoryPanel), { ssr: false })
const SwapRequestDialog = dynamic(() => import("@/components/swap-request-dialog").then((m) => ({ default: m.SwapRequestDialog })), { ssr: false })
import { MySchedule } from "@/components/my-schedule"
import { useViewerStaffId } from "@/lib/role-context"
import { TaskGrid } from "@/components/task-grid"
import { StaffHoverProvider, useStaffHover } from "@/components/staff-hover-context"
import { WeekNotes } from "@/components/week-notes"
import type { StaffWithSkills, ShiftType, ShiftTypeDefinition, Tecnica } from "@/lib/types/database"
import type { ViewMode, CalendarLayout, Assignment, DeptMaps, MenuItem } from "./calendar-panel/types"
import { DEFAULT_DEPT_MAPS, ROLE_ORDER, ROLE_LABEL, ROLE_BORDER, ROLE_DOT, SHIFT_ORDER, TECNICA_PILL, COVERAGE_SKILLS, LEGACY_SKILL_NAMES, TODAY, DAY_ES_2, WARNING_CATEGORY_KEY, WARNING_CATEGORY_ORDER, DOW_HEADERS_EN, DOW_HEADERS_ES } from "./calendar-panel/constants"
import { buildDeptMaps, sortAssignments, addDays, addMonths, getMonthStart, formatToolbarLabel, rotateArray, makeSkillLabel, parseHybridInsights, buildStrategyCards, type GenerationStrategy, type StrategyCardMeta } from "./calendar-panel/utils"

import { ShiftBudgetBar, MonthBudgetBar, LEAVE_ICON_MAP } from "./calendar-panel/budget-bars"

import { WeekJumpButton } from "./calendar-panel/week-jump-button"

import { StaffChip, ShiftBadge, type ShiftBadgeProps } from "./calendar-panel/shift-badge"

import { AssignmentPopover, DEPT_FOR_ROLE } from "./calendar-panel/assignment-popover"

import { DayStatsInput } from "./calendar-panel/day-stats-input"
import { OverflowMenu } from "./calendar-panel/overflow-menu"
import { DepartmentFilterDropdown } from "./calendar-panel/department-filter"
import { MobileOverflow } from "./calendar-panel/mobile-overflow"

// ── Staff profile panel ───────────────────────────────────────────────────────

function InlineLeaveForm({ staffId, open, onClose, onCreated }: { staffId: string | null; open: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("schedule")
  const tl = useTranslations("leaves")
  const tc = useTranslations("common")
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
    onClose()
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

  if (!open) return null

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

function PersonShiftSelector({ assignment, shiftTimes, shiftTypes, isPublished, onShiftChange, simplified, isOff }: {
  assignment: Assignment
  shiftTimes: ShiftTimes | null
  shiftTypes: import("@/lib/types/database").ShiftTypeDefinition[]
  isPublished: boolean
  onShiftChange: (shift: string) => void
  simplified?: boolean
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
        className={cn("w-full rounded select-none flex items-center justify-center px-1.5", simplified ? "py-0.5 min-h-[24px]" : "py-1.5 min-h-[36px]", !isPublished && "cursor-pointer hover:bg-muted/50")}
      >
        {isOff ? (
          <span className="text-[12px] text-muted-foreground font-semibold">OFF</span>
        ) : simplified ? (
          <span className="text-[13px] font-semibold" style={{ color: "var(--pref-bg)" }}>{assignment.shift_type}</span>
        ) : (
          <div className="flex flex-col gap-0 items-center">
            <span className="text-[13px] font-semibold" style={{ color: "var(--pref-bg)" }}>{assignment.shift_type}</span>
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

// ── Inline skills editor for profile panel ──────────────────────────────────

function ProfileSkillsSection({
  staffId, staffSkills, tecnicas, skillLabel, canEdit, onChanged, dirtyRef,
}: {
  staffId: string
  staffSkills: { id: string; skill: string; level: string }[]
  tecnicas: Tecnica[]
  skillLabel: (code: string) => string
  canEdit: boolean
  onChanged?: () => void
  dirtyRef?: React.MutableRefObject<boolean>
}) {
  const t = useTranslations("schedule")
  const ts = useTranslations("skills")
  const locale = useLocale()
  const [saving, setSaving] = useState(false)

  // All available skill codes from active tecnicas
  const allSkills = useMemo(() => {
    const fromTecnicas = tecnicas
      .filter((tc) => tc.activa)
      .map((tc) => tc.codigo)
    return [...new Set(fromTecnicas)]
  }, [tecnicas])

  // Build initial state: skill → level ("off" | "training" | "certified")
  const initialLevels = useMemo(() => {
    const map: Record<string, "off" | "training" | "certified"> = {}
    for (const s of allSkills) map[s] = "off"
    for (const sk of staffSkills) {
      if (allSkills.includes(sk.skill)) map[sk.skill] = sk.level as "training" | "certified"
    }
    return map
  }, [allSkills, staffSkills])

  const [levels, setLevels] = useState(initialLevels)

  // Reset local state when staff changes
  useEffect(() => { setLevels(initialLevels) }, [initialLevels])

  // Track dirty state
  const isDirty = useMemo(() => {
    return allSkills.some((s) => levels[s] !== initialLevels[s])
  }, [allSkills, levels, initialLevels])

  // Expose dirty state to parent for close warning
  useEffect(() => { if (dirtyRef) dirtyRef.current = isDirty }, [isDirty, dirtyRef])

  function cycleLevel(skill: string) {
    if (!canEdit) return
    setLevels((prev) => {
      const current = prev[skill] ?? "off"
      const next = current === "off" ? "training" : current === "training" ? "certified" : "off"
      return { ...prev, [skill]: next }
    })
  }

  async function handleSave() {
    setSaving(true)
    // Compute diffs
    for (const skill of allSkills) {
      const was = initialLevels[skill]
      const now = levels[skill]
      if (was === now) continue
      // Remove old assignment if it existed
      if (was !== "off") {
        await bulkRemoveSkill([staffId], skill)
      }
      // Add new assignment if not off
      if (now !== "off") {
        await bulkAddSkill([staffId], skill, now)
      }
    }
    setSaving(false)
    onChanged?.()
  }

  // Tecnica code map: codigo is already the display code
  const codeMap = useMemo(() =>
    Object.fromEntries(tecnicas.map((tc) => [tc.codigo, tc.codigo]))
  , [tecnicas])

  return (
    <div className="px-5 py-3 border-b border-border">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{ts("title")}</p>

      {allSkills.length === 0 ? (
        <p className="text-[12px] text-muted-foreground italic">{t("noTecnicas")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allSkills.map((skill) => {
            const level = levels[skill] ?? "off"
            const code = codeMap[skill] ?? skill
            const changed = level !== initialLevels[skill]
            return (
              <button
                key={skill}
                type="button"
                disabled={saving || !canEdit}
                onClick={() => cycleLevel(skill)}
                title={canEdit ? (locale === "es"
                  ? `${skillLabel(skill)} — clic para cambiar (${level === "off" ? "desactivado" : level === "training" ? "en formación" : "certificado"})`
                  : `${skillLabel(skill)} — click to cycle (${level})`) : skillLabel(skill)}
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full border font-medium transition-colors",
                  level === "certified" && "bg-blue-50 border-blue-200 text-blue-700",
                  level === "training" && "bg-amber-50 border-amber-200 text-amber-600",
                  level === "off" && "bg-muted/50 border-border text-muted-foreground/60",
                  canEdit && "cursor-pointer hover:shadow-sm",
                  changed && "ring-1 ring-primary/30",
                  saving && "opacity-50"
                )}
              >
                {level === "training" && <Hourglass className="size-2.5 shrink-0" />}
                {code}
              </button>
            )
          })}
        </div>
      )}

      {canEdit && allSkills.length > 0 && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/70 italic">
          {locale === "es" ? "Clic para alternar: desactivado → formación → certificado" : "Click to cycle: off → training → certified"}
        </p>
      )}

      {isDirty && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
          >
            {saving ? (locale === "es" ? "Guardando…" : "Saving…") : (locale === "es" ? "Guardar cambios" : "Save changes")}
          </button>
          <button
            onClick={() => setLevels(initialLevels)}
            disabled={saving}
            className="text-[12px] font-medium text-muted-foreground hover:underline disabled:opacity-50"
          >
            {locale === "es" ? "Cancelar" : "Cancel"}
          </button>
        </div>
      )}
    </div>
  )
}

function StaffProfilePanel({
  staffId, staffList, weekData, open, onClose, onRefreshWeek,
}: {
  staffId: string | null
  staffList: StaffWithSkills[]
  weekData: RotaWeekData | null
  open: boolean
  onClose: () => void
  onRefreshWeek?: () => void
}) {
  const localeRaw = useLocale()
  const locale    = localeRaw as "es" | "en"
  const t         = useTranslations("schedule")
  const tStaff    = useTranslations("staff")
  const tl        = useTranslations("leaves")
  const ts        = useTranslations("skills")
  const tLab      = useTranslations("lab")
  const userRole  = useUserRole()
  const [data, setData]       = useState<StaffProfileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAdjWeeks, setShowAdjWeeks] = useState(false)
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const skillsDirtyRef = useRef(false)

  const handleClose = useCallback(() => {
    if (skillsDirtyRef.current) {
      const msg = locale === "es"
        ? "Tienes cambios sin guardar en las tareas. ¿Salir sin guardar?"
        : "You have unsaved skill changes. Leave without saving?"
      if (!window.confirm(msg)) return
    }
    onClose()
  }, [onClose, locale])

  const weekStart = weekData?.weekStart ?? null
  useEffect(() => {
    if (!staffId || !open) return
    setData(null)
    setLoading(true)
    getStaffProfile(staffId, weekStart ?? undefined).then((d) => { setData(d); setLoading(false) })
  }, [staffId, open, weekStart])

  const staff = staffId ? staffList.find((s) => s.id === staffId) : null
  const deptMaps = buildDeptMaps(weekData?.departments ?? [])
  const ROLE_LABEL = deptMaps.label
  const ROLE_BORDER = deptMaps.border

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
      {open && <div className="fixed inset-0 z-40" onClick={handleClose} />}

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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[14px] font-medium truncate">{staff.first_name} {staff.last_name}</p>
                  {(() => {
                    const deptTecs = (weekData?.tecnicas ?? []).filter((tc) => tc.activa && tc.department.split(",").includes(staff.role))
                    const certCodes = new Set(staff.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill))
                    const allCertified = staff.role !== "admin" && deptTecs.length > 0 && deptTecs.every((tc) => certCodes.has(tc.codigo))
                    return allCertified ? (
                      <Tooltip>
                        <TooltipTrigger render={<Star className="size-3.5 text-amber-400 fill-amber-400 shrink-0" />} />
                        <TooltipContent side="right">Todas las técnicas validadas</TooltipContent>
                      </Tooltip>
                    ) : null
                  })()}
                  {(staff as any).contract_type === "part_time" && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 shrink-0">PT</span>
                  )}
                  {(staff as any).contract_type === "intern" && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 shrink-0">INT</span>
                  )}
                  {(() => {
                    const end = (staff as any).onboarding_end_date as string | null
                    const today = new Date().toISOString().split("T")[0]
                    if (end && today <= end) return (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">ONBOARDING</span>
                    )
                    return null
                  })()}
                  {(staff as any).prefers_guardia === true && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 shrink-0">G</span>
                  )}
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
          <button onClick={handleClose} className="size-7 flex items-center justify-center rounded hover:bg-muted shrink-0">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Weekly shift strips — current + collapsible prev/next */}
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

            {/* Collapsible prev/next weeks */}
            <button
              onClick={() => setShowAdjWeeks(!showAdjWeeks)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-2 w-full"
            >
              {showAdjWeeks ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              <span>{t("previousWeek")} / {t("nextWeek")}</span>
            </button>

            {showAdjWeeks && (
              <div className="mt-2 flex flex-col gap-3">
                {/* Previous week */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("previousWeek")}</p>
                  {loading ? (
                    <div className="shimmer-bar h-7 w-full rounded" />
                  ) : (
                    <div className="grid grid-cols-7 gap-1 opacity-60">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const ws = weekStart ? new Date(weekStart + "T12:00:00") : new Date()
                        const d = new Date(ws); d.setDate(d.getDate() - 7 + i)
                        const dateStr = d.toISOString().split("T")[0]
                        const a = (data?.prevWeekAssignments ?? []).find((a) => a.date === dateStr)
                        return (
                          <div key={i} className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-medium leading-none text-muted-foreground">{DOW_SHORT[i]}</span>
                            <div className={cn(
                              "w-full h-7 rounded flex items-center justify-center text-[10px] font-semibold",
                              a ? "bg-muted text-foreground/60 border border-border"
                                : "bg-muted/50 text-muted-foreground/30 border border-border/30"
                            )}>
                              {a ? a.shift_type : "—"}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {/* Next week */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("nextWeek")}</p>
                  {loading ? (
                    <div className="shimmer-bar h-7 w-full rounded" />
                  ) : (
                    <div className="grid grid-cols-7 gap-1 opacity-60">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const ws = weekStart ? new Date(weekStart + "T12:00:00") : new Date()
                        const d = new Date(ws); d.setDate(d.getDate() + 7 + i)
                        const dateStr = d.toISOString().split("T")[0]
                        const a = (data?.nextWeekAssignments ?? []).find((a) => a.date === dateStr)
                        return (
                          <div key={i} className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-medium leading-none text-muted-foreground">{DOW_SHORT[i]}</span>
                            <div className={cn(
                              "w-full h-7 rounded flex items-center justify-center text-[10px] font-semibold",
                              a ? "bg-muted text-foreground/60 border border-border"
                                : "bg-muted/50 text-muted-foreground/30 border border-border/30"
                            )}>
                              {a ? a.shift_type : "—"}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Capacidades (skills) — editable */}
          {staff && (
            <ProfileSkillsSection
              staffId={staffId!}
              staffSkills={staff.staff_skills}
              tecnicas={weekData?.tecnicas ?? []}
              skillLabel={skillLabel}
              canEdit={userRole !== "viewer"}
              dirtyRef={skillsDirtyRef}
              onChanged={() => {
                // Refresh the staff list so chips update everywhere
                onRefreshWeek?.()
              }}
            />
          )}

          {/* Scheduling rules affecting this person — managers/admins only */}
          {staff && userRole !== "viewer" && (
            <div className="px-5 py-3 border-b border-border">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{t("activeRules")}</p>
              {loading ? (
                <div className="shimmer-bar h-4 w-40 rounded" />
              ) : !data?.rules?.length ? (
                <p className="text-[12px] text-muted-foreground italic">{t("noActiveRules")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.rules.map((rule, i) => {
                    const otherStaff = rule.staff_ids
                      .filter((id) => id !== staffId)
                      .map((id) => staffList.find((s) => s.id === id))
                      .filter(Boolean)
                    const otherNames = otherStaff.map((s) => `${s!.first_name} ${s!.last_name[0]}.`).join(", ")
                    // Extract day pattern from various param keys
                    const dayKeys = ["supervisorDays", "fixedDays", "restrictedDays", "days"] as const
                    const ruleDays = dayKeys.reduce<string[]>((acc, k) => acc.length > 0 ? acc : ((rule.params[k] as string[] | undefined) ?? []), [])
                    const dayStr = ruleDays.length > 0 ? ruleDays.map((d) => DAY_ES_2[d] ?? d).join(", ") : ""
                    // Extra info: training technique, fixed shift
                    const trainingTec = rule.params.training_tecnica_code as string | undefined
                    const tecLabel = trainingTec ? (weekData?.tecnicas?.find((tc) => tc.codigo === trainingTec)?.nombre_es ?? trainingTec) : null
                    const fixedShift = rule.params.fixedShift as string | undefined
                    const detail = [otherNames, dayStr ? `(${dayStr})` : "", tecLabel, fixedShift].filter(Boolean).join(" · ")
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <div className={cn(
                          "mt-1 size-1.5 rounded-full shrink-0",
                          rule.is_hard ? "bg-red-400" : "bg-amber-400"
                        )} />
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-foreground">{tLab(`rules.types.${rule.type}`)}</p>
                          {detail && (
                            <p className="text-[11px] text-muted-foreground truncate">{detail}</p>
                          )}
                          {rule.expires_at && (
                            <p className="text-[11px] text-muted-foreground">
                              <Clock className="inline size-2.5 mr-0.5 -mt-0.5" />
                              {formatDateWithYear(rule.expires_at, locale)}
                            </p>
                          )}
                          {rule.notes && (
                            <p className="text-[11px] text-muted-foreground italic truncate">{rule.notes}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

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
                  <p className="text-muted-foreground">{t("daysPerWeek")}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <p className="text-foreground font-medium">{staff.days_per_week ?? 5} {locale === "es" ? "días/sem" : "days/wk"}</p>
                    {(staff as any).contract_type === "part_time" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">{locale === "es" ? "A tiempo parcial" : "Part-time"}</span>
                    )}
                    {(staff as any).contract_type === "intern" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">{locale === "es" ? "Becario" : "Intern"}</span>
                    )}
                  </div>
                </div>
                {(() => {
                  const end = (staff as any).onboarding_end_date as string | null
                  const today = new Date().toISOString().split("T")[0]
                  if (!end) return null
                  return (
                    <div>
                      <p className="text-muted-foreground">{locale === "es" ? "Periodo de incorporación" : "Onboarding until"}</p>
                      <p className={`text-[12px] font-medium ${today <= end ? "text-amber-600" : "text-muted-foreground"}`}>
                        {formatDateWithYear(end, locale)}
                        {today <= end ? ` (${locale === "es" ? "activo" : "active"})` : ` (${locale === "es" ? "completado" : "done"})`}
                      </p>
                    </div>
                  )
                })()}
                <div>
                  <p className="text-muted-foreground">{tStaff("daysAvailable")}</p>
                  <p className="text-foreground font-medium">{(staff.working_pattern ?? []).map((d) => DAY_ES_2[d] ?? d).join(", ")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("preferredShift")}</p>
                  {staff.preferred_shift ? (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {staff.preferred_shift.split(",").filter(Boolean).map((s) => (
                        <span key={s} className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {s.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-foreground font-medium">{t("noPreference")}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">{t("dayPreferences")}</p>
                  {(staff.preferred_days?.length ?? 0) > 0 || (staff.avoid_days?.length ?? 0) > 0 ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      {(staff.preferred_days ?? []).map((d) => (
                        <span key={d} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[var(--pref-bg)] text-white">{DAY_ES_2[d] ?? d}</span>
                      ))}
                      {(staff.avoid_days ?? []).map((d) => (
                        <span key={d} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C]">{DAY_ES_2[d] ?? d}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-foreground font-medium">{t("noPreference")}</p>
                  )}
                </div>
                {staff.end_date && (
                  <div>
                    <p className="text-muted-foreground">{t("endDate")}</p>
                    <p className="text-foreground font-medium">{formatDateWithYear(staff.end_date, locale)}</p>
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
        <InlineLeaveForm staffId={staffId} open={showLeaveForm} onClose={() => setShowLeaveForm(false)} onCreated={() => {
          // Re-fetch profile to update leaves
          if (staffId) {
            setLoading(true)
            getStaffProfile(staffId, weekStart ?? undefined).then((d) => { setData(d); setLoading(false) })
          }
          // Refresh the week view so the leave shows on the calendar grid
          onRefreshWeek?.()
        }} />

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="border-t border-border px-5 py-4 shrink-0 flex items-center justify-between">
          <Button variant="outline" onClick={() => setShowLeaveForm(true)} className="gap-1.5 text-[14px] h-9">
            <CalendarPlus className="size-4" />
            {tl("addLeave")}
          </Button>
          <a href={`/staff/${staffId}`} className="text-[13px] text-primary hover:underline">{tStaff("profile")}</a>
        </div>
      </div>
    </>
  )
}

import { DayWarningPopover, WarningsPill } from "./calendar-panel/warnings"

// ── Person view (Vista por persona) ───────────────────────────────────────────


function PersonShiftPill({ assignment, shiftTimes, tecnica, onClick, taskDisabled, simplified }: {
  assignment: Assignment
  shiftTimes: ShiftTimes | null
  tecnica: Tecnica | null
  onClick?: (e: React.MouseEvent) => void
  taskDisabled?: boolean
  simplified?: boolean
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
        simplified ? "py-0.5 min-h-[24px] justify-center" : "py-1.5 min-h-[36px] justify-center",
        !onClick ? "cursor-default" : "cursor-pointer hover:bg-muted/50",
      )}
    >
      {simplified ? (
        <span className="text-[13px] font-semibold" style={{ color: "var(--pref-bg)" }}>{shift_type}</span>
      ) : (
        <div className="flex flex-col gap-0 items-center">
          <span className="text-[13px] font-semibold" style={{ color: "var(--pref-bg)" }}>{shift_type}</span>
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
  onChipClick, onDateClick, colorChips, compact, punctionsDefault, punctionsOverride, onPunctionsChange, simplified,
  isGenerating, swapStaffId,
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
  compact?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  simplified?: boolean
  onDateClick?: (date: string) => void
  isGenerating?: boolean
  swapStaffId?: string | null
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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)" }}>
          <div className="h-[72px] border-b border-r border-border" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center py-2 border-b border-r last:border-r-0 border-border gap-1">
              <div className="shimmer-bar h-2.5 w-6" />
              <div className="shimmer-bar w-8 h-8 rounded-full" />
              <div className="shimmer-bar h-2.5 w-12 rounded" />
            </div>
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <Fragment key={i}>
              <div className="px-3 py-2.5 border-b border-r border-border flex items-center">
                <div className="shimmer-bar h-3 w-28" />
              </div>
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="p-1.5 border-b border-r last:border-r-0 border-border min-h-[48px] flex items-center">
                  <div className="shimmer-bar h-9 w-full rounded" />
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { label: ROLE_LABEL_MAP, order: ROLE_ORDER_MAP } = buildDeptMaps(data.departments ?? [])

  // Build assignment lookup: staffId → date → assignment
  const assignMap = useMemo(() => {
    const map: Record<string, Record<string, Assignment>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!map[a.staff_id]) map[a.staff_id] = {}
        map[a.staff_id][day.date] = a
      }
    }
    return map
  }, [localDays])

  // Shift highlighting — hover a shift to highlight all same-shift cells
  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredShift, setHoveredShift] = useState<string | null>(null)

  // Active staff sorted by role then first name + role grouping
  const { activeStaff, roleGroups } = useMemo(() => {
    const active = staffList
      .filter((s) => s.onboarding_status !== "inactive")
      .sort((a, b) => {
        const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
      })
    const groups: { role: string; members: StaffWithSkills[] }[] = []
    for (const s of active) {
      const last = groups[groups.length - 1]
      if (last && last.role === s.role) last.members.push(s)
      else groups.push({ role: s.role, members: [s] })
    }
    return { activeStaff: active, roleGroups: groups }
  }, [staffList])

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
          const isSun   = d.getDay() === 0
          const isWknd  = isSat || isSun
          return (
            <div key={day.date} className={cn(
              "relative flex flex-col items-center justify-center py-1 gap-0 border-b border-r last:border-r-0 border-border",
              holiday ? "bg-amber-100/80" : "bg-muted"
            )}
            style={{
              ...(isSat ? { borderLeft: "1px dashed var(--border)" } : {}),
            }}
            >
              {day.warnings.length > 0 && (
                <DayWarningPopover warnings={day.warnings} />
              )}
              <button
                onClick={() => onDateClick?.(day.date)}
                className={cn("flex flex-col items-center gap-0 cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
              >
                <span className={cn("text-[10px] uppercase tracking-wider", isWknd && !holiday ? "text-muted-foreground/50" : "text-muted-foreground")}>{wday}</span>
                <span className={cn(
                  "font-semibold leading-none text-[18px]",
                  today ? "size-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[15px]"
                  : holiday ? "text-amber-600" : isWknd ? "text-muted-foreground" : "text-primary"
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
              {/* Punciones / Biopsias — same component as ShiftGrid (hidden in simplified mode) */}
              {!simplified && (() => {
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
                    compact
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
                    className={cn("border-b border-r border-border bg-background sticky left-0 z-10 flex items-center min-w-0 cursor-pointer hover:bg-muted/50", compact ? "px-1.5 py-0.5 min-h-[28px]" : "px-2 py-1 min-h-[36px]")}
                    style={colorChips ? { borderLeft: `3px solid ${DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8"}` } : undefined}
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
                    const isOffCell = !assignment && !onLeave && isPublished
                    return (
                      <div
                        key={day.date}
                        className={cn("border-b border-r last:border-r-0 border-border flex items-center transition-colors duration-100", compact ? "px-0.5 py-0 min-h-[24px]" : "px-0.5 py-0.5 min-h-[36px]", isShiftHovered ? "bg-primary/10" : "bg-background")}
                        style={isOffCell ? { backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" } : undefined}
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
                              simplified={simplified}
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
                          ) : swapStaffId && s.id === swapStaffId && isPublished ? (
                            <div
                              className="w-full relative group/swap cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); onChipClick(assignment, day.date) }}
                            >
                              <PersonShiftPill
                                assignment={assignment}
                                shiftTimes={shiftTimes}
                                tecnica={tecnica}
                                simplified={simplified}
                              />
                              <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                                <ArrowRightLeft className="size-2.5" />
                              </span>
                            </div>
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
                                  simplified={simplified}
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
                            simplified={simplified}
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
      {/* Shift legend — shown in simplified mode */}
      {simplified && shiftTimes && Object.keys(shiftTimes).length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-border bg-muted/50">
          {Object.entries(shiftTimes).map(([code, time]) => (
            <span key={code} className="text-[11px] text-muted-foreground">
              <span className="font-semibold" style={{ color: "var(--pref-bg)" }}>{code}</span>
              {" "}{time.start}–{time.end}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Transposed Person Grid (días como filas) ─────────────────────────────────

function TransposedPersonGrid({
  data, staffList, locale, isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick, colorChips, compact, simplified, punctionsDefault, punctionsOverride, onPunctionsChange,
  swapStaffId,
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
  simplified?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  swapStaffId?: string | null
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
      <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${allMembers.length}, minmax(${compact ? "48px" : "60px"}, 1fr))`, minWidth: allMembers.length * (compact ? 53 : 65) + 80 }}>

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
              style={colorChips ? { borderTop: `3px solid ${DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8"}` } : { borderTop: "none" }}
            >
              <button
                onClick={() => onChipClick({ staff_id: s.id }, "")}
                className="flex flex-col items-center cursor-pointer hover:opacity-70 transition-opacity"
              >
                <span className={cn("font-medium text-center leading-tight truncate w-full", compact ? "text-[9px]" : "text-[10px]")}>
                  {s.first_name}
                </span>
                <span className={cn("text-muted-foreground text-center truncate w-full", compact ? "text-[8px]" : "text-[9px]")}>
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
                {day.warnings?.length > 0 && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase">{wday}</span>
                  <span className={cn(
                    "font-semibold leading-none",
                    today ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary"
                  )}>
                    {dayN}
                  </span>
                </div>
                {holiday && (
                  <Tooltip>
                    <TooltipTrigger render={<span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>} />
                    <TooltipContent side="right">{holiday}</TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* Staff cells for this day */}
              {allMembers.map((s, i) => {
                const assignment = assignMap[s.id]?.[day.date]
                const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)
                const cellShift = assignment ? assignment.shift_type : (onLeave ? "__leave__" : "__off__")
                const isHovered = highlightEnabled && hoveredShift && cellShift === hoveredShift
                const prevRole = i > 0 ? allMembers[i - 1].role : null
                const isNewGroup = s.role !== prevRole

                const isOffCell = !assignment && !onLeave && isPublished
                const isViewerCell = !!swapStaffId && s.id === swapStaffId && !!assignment && isPublished
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "border-b border-r last:border-r-0 border-border flex items-center justify-center transition-colors duration-100",
                      compact ? "min-h-[22px] px-0.5 py-0" : "min-h-[28px] px-0.5 py-0.5",
                      isHovered ? "bg-primary/10" : "bg-background",
                      isViewerCell && "relative group/swap cursor-pointer",
                    )}
                    style={isOffCell ? { backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" } : undefined}
                    onMouseEnter={() => setHoveredShift(cellShift)}
                    onMouseLeave={() => setHoveredShift(null)}
                    onClick={isViewerCell ? (e) => { e.stopPropagation(); onChipClick(assignment!, day.date) } : undefined}
                  >
                    {isViewerCell && (
                      <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                        <ArrowRightLeft className="size-2.5" />
                      </span>
                    )}
                    {assignment ? (
                      !isPublished ? (
                        <PersonShiftSelector
                          assignment={assignment}
                          shiftTimes={shiftTimes}
                          shiftTypes={data?.shiftTypes ?? []}
                          isPublished={false}
                          simplified={simplified !== false}
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
                      ) : simplified !== false ? (
                        <span className={cn("font-semibold tabular-nums", compact ? "text-[10px]" : "text-[12px]")} style={{ color: "var(--pref-bg)" }}>
                          {assignment.shift_type}
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-0">
                          <span className={cn("font-semibold tabular-nums", compact ? "text-[10px]" : "text-[12px]")} style={{ color: "var(--pref-bg)" }}>
                            {assignment.shift_type}
                          </span>
                          {shiftTimes?.[assignment.shift_type] && (
                            <span className={cn("text-muted-foreground", compact ? "text-[8px]" : "text-[9px]")}>
                              {shiftTimes[assignment.shift_type].start}–{shiftTimes[assignment.shift_type].end}
                            </span>
                          )}
                        </div>
                      )
                    ) : onLeave ? (
                      <span className={cn("text-muted-foreground italic", compact ? "text-[9px]" : "text-[11px]")}>{t("leaveShort")}</span>
                    ) : !isPublished ? (
                      <PersonShiftSelector
                        assignment={{ id: "", shift_type: "", staff_id: s.id, staff: s as any, is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false } as Assignment}
                        shiftTimes={shiftTimes}
                        shiftTypes={data?.shiftTypes ?? []}
                        isPublished={false}
                        simplified={simplified !== false}
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
      {/* Shift legend — shown in simplified mode */}
      {simplified !== false && shiftTimes && Object.keys(shiftTimes).length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-border bg-muted/50">
          {Object.entries(shiftTimes).map(([code, time]) => (
            <span key={code} className="text-[11px] text-muted-foreground">
              <span className="font-semibold" style={{ color: "var(--pref-bg)" }}>{code}</span>
              {" "}{time.start}–{time.end}
            </span>
          ))}
        </div>
      )}
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
  punctionsDefault, punctionsOverride, onPunctionsChange, onBiopsyChange,
  onRefresh, onAfterMutation, onCancelUndo, onSaved, weekStart, compact, colorChips, simplified, onDateClick, onLocalDaysChange,
  ratioOptimal, ratioMinimum, timeFormat = "24h",
  biopsyConversionRate = 0.5, biopsyDay5Pct = 0.5, biopsyDay6Pct = 0.5,
  swapStaffId,
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
  onBiopsyChange?: (date: string, value: number) => void
  onRefresh: () => void
  onAfterMutation?: (snapshot: RotaWeekData, inverse: () => Promise<{ error?: string }>, forward: () => Promise<{ error?: string }>) => void
  onCancelUndo?: () => void
  onSaved?: () => void
  weekStart: string
  compact?: boolean
  colorChips?: boolean
  simplified?: boolean
  onDateClick?: (date: string) => void
  onLocalDaysChange?: (days: RotaDay[]) => void
  ratioOptimal?: number
  ratioMinimum?: number
  timeFormat?: string
  biopsyConversionRate?: number
  biopsyDay5Pct?: number
  biopsyDay6Pct?: number
  swapStaffId?: string | null
}) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")

  // O(1) staff lookup by ID
  const staffById = useMemo(() => new Map(staffList.map((s) => [s.id, s])), [staffList])

  // Staff color map — maps each staff member to their department colour
  const deptColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const dept of (data?.departments ?? [])) m[dept.code] = dept.colour
    return m
  }, [data?.departments])
  const staffColorMap = useMemo(() =>
    Object.fromEntries(staffList.map((s) => [s.id, s.color || deptColorMap[s.role] || DEFAULT_DEPT_MAPS.border[s.role] || "#94A3B8"]))
  , [staffList, deptColorMap])
  const { hoveredStaffId, setHovered } = useStaffHover()

  // Require 5px movement before drag activates — allows click events to pass through
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Compute header dates from weekStart so they update immediately on navigation
  const headerDates = useMemo(() => {
    const dates: string[] = []
    const base = new Date(weekStart + "T12:00:00")
    for (let i = 0; i < 7; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      dates.push(d.toISOString().split("T")[0])
    }
    return dates
  }, [weekStart])

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
      const staffMember = staffById.get(staffId)

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

      {
        const snapshot = data
        const idCapture: { value: string | undefined } = { value: undefined }
        if (snapshot) {
          onAfterMutation?.(
            snapshot,
            () => idCapture.value ? deleteAssignment(idCapture.value) : Promise.resolve({ error: "Cannot undo" }),
            () => upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift }),
          )
        }
        try {
          const result = await upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift })
          if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
          idCapture.value = result.id
          onSaved?.()
        } catch {
          onCancelUndo?.(); toast.error(t("assignmentError")); onRefresh(); return
        }
      }
      // No refresh — optimistic state is correct
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
      const snapshot = data
      if (snapshot) {
        onAfterMutation?.(
          snapshot,
          () => upsertAssignment({ weekStart, staffId: oldStaff, date: oldDate, shiftType: oldShift }),
          () => removeAssignment(assignmentId),
        )
      }
      try {
        const result = await removeAssignment(assignmentId)
        if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
        onSaved?.()
        // No refresh — optimistic state is correct
      } catch {
        onCancelUndo?.(); toast.error(t("removeError")); onRefresh()
      }
    } else {
      const destDate  = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11)

      if (sourceAssignment.date !== destDate) {
        toast.error(t("shiftMoveError"))
        return
      }

      const oldShift = sourceAssignment.shift_type
      const snapshot = data
      // Optimistic: change shift_type immediately
      setLocalDays((prev) => prev.map((d) => ({
        ...d, assignments: d.assignments.map((a) =>
          a.id === assignmentId ? { ...a, shift_type: destShift, is_manual_override: true } : a
        ),
      })))
      if (snapshot) {
        onAfterMutation?.(
          snapshot,
          () => moveAssignmentShift(assignmentId, oldShift),
          () => moveAssignmentShift(assignmentId, destShift),
        )
      }
      try {
        const result = await moveAssignmentShift(assignmentId, destShift)
        if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
        onSaved?.()
        // Don't refresh — optimistic state is already correct
      } catch {
        onCancelUndo?.(); toast.error(t("moveError")); onRefresh()
      }
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border">
          <div className="border-r border-border h-[72px]" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center justify-center py-1.5 gap-1">
              <div className="shimmer-bar h-2.5 w-6" />
              <div className="shimmer-bar w-8 h-8 rounded-full" />
              <div className="shimmer-bar h-2.5 w-12 rounded" />
            </div>
          ))}
        </div>
        {/* Rows — enough to cover up to 5 shifts + off */}
        {Array.from({ length: 6 }).map((_, row) => (
          <div key={row} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border">
            <div className="border-r border-border flex items-center justify-end px-2 py-3">
              <div className="shimmer-bar h-3 w-8" />
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="p-2 flex items-center justify-center min-h-[36px] bg-background">
                <div className="shimmer-bar h-5 w-full rounded" />
              </div>
            ))}
          </div>
        ))}
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

        {/* Header row — uses headerDates (from weekStart) so dates update immediately on navigation */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] sticky top-0 z-10 border-b border-border" style={{ minHeight: 52 }}>
          <div className="bg-muted" />
          {headerDates.map((dateStr) => {
            const day   = localDays.find((ld) => ld.date === dateStr)
            const d     = new Date(dateStr + "T12:00:00")
            const wday  = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
            const dayN  = String(d.getDate())
            const today = dateStr === TODAY
            const isSat = d.getDay() === 6
            const isSun = d.getDay() === 0
            const isWknd = isSat || isSun
            const holidayName = publicHolidays[dateStr]

            const defaultP      = punctionsDefault[dateStr] ?? 0
            const effectiveP    = punctionsOverride[dateStr] ?? defaultP
            const hasOverride   = punctionsOverride[dateStr] !== undefined

            return (
              <div
                key={dateStr}
                className={cn(
                  "relative flex flex-col items-center justify-center py-1 gap-0 border-l border-border",
                  holidayName ? "bg-amber-100/80" : "bg-muted"
                )}
              >
                {day && day.warnings.length > 0 && (
                  <DayWarningPopover warnings={day.warnings} />
                )}

                <button
                  onClick={() => onDateClick?.(dateStr)}
                  className={cn("flex flex-col items-center gap-0 cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
                >
                  <span className={cn("text-[10px] uppercase tracking-wider", isWknd && !holidayName ? "text-muted-foreground/50" : "text-muted-foreground")}>{wday}</span>
                  <span className={cn(
                    "font-semibold leading-none text-[18px]",
                    today ? "size-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[15px]"
                    : holidayName ? "text-amber-600 dark:text-amber-400" : isWknd ? "text-muted-foreground" : "text-primary"
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

                {/* Punciones + biopsias — single clickable area (hidden in simplified mode) */}
                {!simplified && (() => {
                  // Biopsy forecast: punciones from 5 and 6 days ago
                  const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
                  function getPuncForDate(ds: string): number {
                    // Try override, then default map, then lab config by weekday
                    if (punctionsOverride[ds] !== undefined) return punctionsOverride[ds]
                    if (punctionsDefault[ds] !== undefined) return punctionsDefault[ds]
                    // Fallback: use weekday default from punctionsDefault of same weekday in current week
                    const dow = new Date(ds + "T12:00:00").getDay()
                    const sameDow = Object.entries(punctionsDefault).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
                    return sameDow ? sameDow[1] : 0
                  }
                  const d5ago = new Date(dateStr + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
                  const d6ago = new Date(dateStr + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
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
                      date={dateStr}
                      value={effectiveP}
                      defaultValue={defaultP}
                      isOverride={hasOverride}
                      onChange={onPunctionsChange}
                      onBiopsyChange={onBiopsyChange}
                      disabled={isPublished || !data.rota}
                      biopsyForecast={forecast}
                      biopsyTooltip={tooltip}
                      compact
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
            <div className="flex flex-col items-end justify-center px-2.5 py-2 bg-muted">
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
              const cellDow   = new Date(day.date + "T12:00:00").getDay()
              const isSatCell = cellDow === 6
              const isWkndCell = isSatCell || cellDow === 0
              const isEmpty   = dayShifts.length === 0 && effectivePDay === 0
              return (
                <DroppableCell
                  key={day.date}
                  id={cellId}
                  isOver={overId === cellId}
                  isPublished={isPublished}
                  onClick={() => { if (!isPublished) onCellClick(day.date, shiftRow) }}
                  className={cn(
                    "p-1.5 flex flex-col gap-1 border-l border-border",
                    "bg-background",
                    compact ? "min-h-[32px]" : "min-h-[48px]",
                    !isPublished && "cursor-pointer"
                  )}
                  style={undefined}
                >
                  {dayShifts.map((a) => {
                    const staffMember = staffById.get(a.staff_id)
                    const taskDisabled = data?.rotaDisplayMode === "by_shift" && !data?.enableTaskInShift
                    const cleanFn = a.function_label?.startsWith("dept_") ? null : a.function_label
                    const tecnica = taskDisabled ? null
                      : cleanFn
                      ? (data?.tecnicas ?? []).find((t) => t.codigo === cleanFn) ?? null
                      : (data?.tecnicas ?? []).find((t) => t.id === a.tecnica_id) ?? null
                    const isViewerChip = !!swapStaffId && a.staff_id === swapStaffId
                    return (
                      <AssignmentPopover
                        key={a.id}
                        assignment={a}
                        staffSkills={staffMember?.staff_skills ?? []}
                        tecnicas={data?.tecnicas ?? []}
                        departments={data?.departments ?? []}
                        onFunctionSave={handleFunctionLabelSave}
                        isPublished={isPublished}
                        disabled={taskDisabled || isViewerChip}
                      >
                        <Tooltip>
                          <TooltipTrigger render={
                            <div
                              onClick={(taskDisabled || isViewerChip) ? (e: React.MouseEvent) => { e.stopPropagation(); onChipClick(a, day.date) } : undefined}
                              className={cn((taskDisabled || isViewerChip) ? "cursor-pointer" : undefined, isViewerChip && "relative group/swap")}
                            >
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
                                trainingTecCode={data?.trainingByStaff?.[day.date]?.[a.staff_id] ?? null}
                              />
                              {isViewerChip && (
                                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                                  <ArrowRightLeft className="size-2.5" />
                                </span>
                              )}
                            </div>
                          } />
                          <TooltipContent side="right">
                            {a.staff.first_name} {a.staff.last_name} · {ROLE_LABEL[a.staff.role] ?? a.staff.role}{tecnica ? ` · ${tecnica.nombre_es}` : cleanFn ? ` · ${cleanFn}` : ""}{data?.trainingByStaff?.[day.date]?.[a.staff_id] ? ` · ⏳ ${data.trainingByStaff[day.date][a.staff_id]}` : cleanFn && staffMember?.staff_skills?.find((sk) => sk.skill === cleanFn)?.level === "training" ? ` · ${t("inTraining")}` : ""}
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

        {/* OFF row */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] bg-muted">
          <div className="flex flex-col items-end justify-center px-2.5 py-2">
            <span className="text-[10px] text-muted-foreground leading-tight font-medium uppercase tracking-wide">OFF</span>
          </div>
          {localDays.map((day) => {
            const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
            const leaveIds    = new Set(onLeaveByDate[day.date] ?? [])
            const dow         = new Date(day.date + "T12:00:00").getDay() // 0=Sun, 6=Sat
            const isSaturday   = dow === 6
            const isWeekendOff = dow === 6 || dow === 0
            const offCellId    = `OFF-${day.date}`

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
                className="p-1.5 flex flex-col gap-1 border-l border-border"
                style={{
                  backgroundColor: "var(--color-card)",
                  backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)",
                  backgroundSize: "10px 10px",
                }}
              >
                {/* On leave — always first, not draggable, gray + airplane */}
                {onLeaveStaff.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  return (
                  <div
                    key={s.id}
                    onClick={() => onChipClick({ staff_id: s.id } as Assignment, day.date)}
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="flex items-center gap-1 py-0.5 text-[11px] font-medium w-full bg-card text-muted-foreground border border-border select-none cursor-pointer transition-colors duration-150"
                    style={{ borderLeft: colorChips ? `3px solid ${isHov && staffColorMap[s.id] ? staffColorMap[s.id] : "var(--muted-foreground)"}` : undefined, borderRadius: 4, paddingLeft: 5, paddingRight: 6, ...(isHov && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : {}) }}
                  >
                    <span className="truncate italic">{s.first_name} {s.last_name[0]}.</span>
                    <Plane className="size-3 shrink-0 ml-auto text-muted-foreground/40" />
                  </div>
                  )
                })}
                {/* Available — draggable + clickable for profile */}
                {availableOff.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  return (
                  <DraggableOffStaff key={s.id} staffId={s.id} date={day.date} disabled={isPublished}>
                    <div
                      onClick={() => onChipClick({ staff_id: s.id } as Assignment, day.date)}
                      onMouseEnter={() => setHovered(s.id)}
                      onMouseLeave={() => setHovered(null)}
                      className="flex items-center gap-1 py-0.5 text-[11px] font-medium w-full bg-card text-muted-foreground border border-border cursor-pointer transition-colors duration-150"
                      style={{ borderLeft: colorChips ? `3px solid ${isHov && staffColorMap[s.id] ? staffColorMap[s.id] : (ROLE_BORDER[s.role] ?? "#94A3B8")}` : undefined, borderRadius: 4, paddingLeft: 5, paddingRight: 6, ...(isHov && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : {}) }}
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
              readOnly
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
              readOnly
              borderColor={ROLE_BORDER[activeOffStaff.role]}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── Month view ────────────────────────────────────────────────────────────────

function MonthGrid({ summary, loading, locale, currentDate, onSelectDay, onSelectWeek, firstDayOfWeek = 0, punctionsOverride = {}, onPunctionsChange, onBiopsyChange, monthViewMode = "shift", colorChips }: {
  summary: RotaMonthSummary | null
  loading: boolean
  locale: string
  currentDate: string
  onSelectDay: (date: string) => void
  onSelectWeek: (weekStart: string) => void
  firstDayOfWeek?: number
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  monthViewMode?: "shift" | "person"
  colorChips?: boolean
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
    <div className="flex flex-col gap-1.5 flex-1 min-h-0">
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
          <div key={wi} className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5 flex-1">
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
                const isPast     = day.date < TODAY
                const dayNum     = String(new Date(day.date + "T12:00:00").getDate())
                const dayDow     = new Date(day.date + "T12:00:00").getDay()
                const isSat      = dayDow === 6
                const isSun      = dayDow === 0

                const deptParts: string[] = []
                if (day.labCount > 0) deptParts.push(`Lab ${day.labCount}`)
                if (day.andrologyCount > 0) deptParts.push(`${locale === "es" ? "Andr" : "Andr"} ${day.andrologyCount}`)
                if (day.adminCount > 0) deptParts.push(`Admin ${day.adminCount}`)
                // PB Index — b/pu ratio vs expected conversion rate, shown as colored indicator
                const tooltipPb = (() => {
                  const s = summary as RotaMonthSummary
                  const pu = punctionsOverride[day.date] ?? day.punctions
                  const d5ago = new Date(day.date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
                  const d6ago = new Date(day.date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
                  const d5str = d5ago.toISOString().split("T")[0]
                  const d6str = d6ago.toISOString().split("T")[0]
                  const p5 = punctionsOverride[d5str] ?? s.days.find((dd) => dd.date === d5str)?.punctions ?? 0
                  const p6 = punctionsOverride[d6str] ?? s.days.find((dd) => dd.date === d6str)?.punctions ?? 0
                  const cr = s.biopsyConversionRate ?? 0.5
                  const b = Math.round(p5 * cr * (s.biopsyDay5Pct ?? 0.5) + p6 * cr * (s.biopsyDay6Pct ?? 0.5))
                  if (pu === 0 && b === 0) return null
                  const indexPct = pu > 0 ? Math.round((b / pu) * 100) : null
                  const expectedPct = Math.round(cr * 100)
                  const color = indexPct === null ? "text-muted-foreground"
                    : indexPct >= expectedPct * 0.8 ? "text-emerald-400"
                    : indexPct >= expectedPct * 0.5 ? "text-amber-400"
                    : "text-red-400"
                  return { indexPct, color }
                })()
                const tooltipParts: string[] = []
                if (day.staffCount > 0) tooltipParts.push(`${day.staffCount} ${locale === "es" ? "personas" : "staff"}${deptParts.length ? " · " + deptParts.join(" · ") : ""}`)
                if (day.leaveCount > 0) tooltipParts.push(`${day.leaveCount} ${locale === "es" ? "ausencias" : "absences"}`)
                if (day.hasSkillGaps) {
                  if ((day.warningMessages?.length ?? 0) > 0) {
                    tooltipParts.push(...day.warningMessages)
                  } else {
                    tooltipParts.push(locale === "es" ? "Tareas sin cobertura" : "Uncovered tasks")
                  }
                }
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
                      "relative flex flex-col items-start p-2.5 rounded-lg border text-left transition-colors min-h-[100px] flex-1",
                      isPast && !isToday && "opacity-55",
                      !day.isCurrentMonth
                        ? "bg-muted/40 border-border/30"
                        : day.holidayName
                        ? day.isWeekend ? "bg-muted/40 border-border hover:bg-accent/20" : "bg-muted/20 border-border hover:bg-accent/10"
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
                          ? <AlertTriangle className="size-3.5 text-amber-500" />
                          : <Check className="size-3.5 text-emerald-500" />
                      )}
                    </div>

                    {/* Holiday name */}
                    {day.holidayName && day.isCurrentMonth && (
                      <span className="text-[10px] text-amber-500/80 leading-tight truncate w-full mt-1">{day.holidayName}</span>
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
                                ...(colorChips ? { borderLeft: `2px solid ${roleColor}` } : {}),
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
                      <div className="flex-1 flex items-center py-1">
                        <div className="flex flex-wrap items-center gap-1">
                          {Object.entries(day.shiftCounts ?? {})
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([shift, count]) => (
                              <span key={shift} className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-normal bg-primary/10 text-primary border border-primary/20 tabular-nums">
                                {shift} <span className="font-semibold text-foreground">{count}</span>
                              </span>
                            ))}
                        </div>
                      </div>
                    ) : <div className="flex-1" />}

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
                        if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
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
                        <div className="flex items-end gap-2">
                          <DayStatsInput
                            date={day.date}
                            value={effectiveP}
                            defaultValue={day.punctions}
                            isOverride={isOverride}
                            onChange={onPunctionsChange ?? (() => {})}
                            onBiopsyChange={onBiopsyChange}
                            disabled={!onPunctionsChange}
                            biopsyForecast={bForecast}
                            biopsyTooltip={locale === "es" ? `${bForecast} biopsias previstas` : `${bForecast} biopsy forecast`}
                          />
                          {day.leaveCount > 0 && (
                            <span className="flex items-center gap-0.5 text-amber-500 ml-auto self-end pb-0.5">
                              <Briefcase className="size-3" />{day.leaveCount}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </button>
                    } />
                    {(tooltipText || tooltipPb) && (
                      <TooltipContent side="top">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {tooltipText && <span>{tooltipText}</span>}
                          {tooltipText && tooltipPb && <span className="opacity-40">·</span>}
                          {tooltipPb && (
                            <span className={cn("font-semibold", tooltipPb.color)}>
                              {tooltipPb.indexPct !== null ? `PB ${tooltipPb.indexPct}%` : "PB —"}
                            </span>
                          )}
                        </span>
                      </TooltipContent>
                    )}
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

function DayView({ day, loading, locale, departments = [], punctions, biopsyForecast, isEditMode, onRemoveAssignment, onAddStaff, data, staffList, mobileCompact, mobileDeptColor = true, ratioOptimal, ratioMinimum }: {
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
  ratioOptimal?: number
  ratioMinimum?: number
}) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")

  // Build dept color map: role code → colour
  const { hoveredStaffId, setHovered } = useStaffHover()
  const { deptColorMap, deptLabelMap } = useMemo(() => {
    const colors: Record<string, string> = {}
    const labels: Record<string, string> = {}
    for (const d of departments) {
      if (!d.parent_id) { colors[d.code] = d.colour; labels[d.code] = d.name }
    }
    return { deptColorMap: colors, deptLabelMap: labels }
  }, [departments])
  // Staff → department colour map
  const staffColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    ;(staffList ?? []).forEach((s) => { m[s.id] = deptColorMap[s.role] ?? DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8" })
    return m
  }, [staffList, deptColorMap])
  const deptByCode = useMemo(() => Object.fromEntries((departments ?? []).map((d) => [d.code, d])), [departments])
  const tecByCode = useMemo(() => Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.codigo, t])), [data?.tecnicas])

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
              <div className="flex items-center gap-2">
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
                            const weekDays = data?.days ?? []
                            const workedDays = weekDays.filter((d) => d.assignments.some((as) => as.staff_id === a.staff_id))
                            const offDays = weekDays.filter((d) => !d.assignments.some((as) => as.staff_id === a.staff_id))
                            const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                            const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                            return <p className="text-[11px] opacity-70">{deptName} · {workedDays.length}/{staffMember?.days_per_week ?? "?"}d{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
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
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-[12px] italic cursor-pointer active:scale-95">
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
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-background text-muted-foreground text-[12px] cursor-pointer active:scale-95"
                        style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 6 }}>
                        {s.first_name} {s.last_name[0]}.
                      </span>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      {(() => {
                        const weekDays = data?.days ?? []
                        const offDays = weekDays.filter((d) => !d.assignments.some((a) => a.staff_id === s.id))
                        const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                        const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                        return <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                      })()}
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
                    <TapPopover key={s.id} trigger={
                      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer">
                        <LeaveIcon className="size-3 text-amber-500 shrink-0" />
                        <span className="text-[13px] text-amber-700 italic">{s.first_name} {s.last_name}</span>
                      </div>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d</p>
                    </TapPopover>
                  )
                })}
                {offDuty.map((s) => {
                  const roleColor = deptColorMap[s.role] ?? "#64748B"
                  return (
                    <TapPopover key={s.id} trigger={
                      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border/50 bg-background text-muted-foreground cursor-pointer" style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 8 }}>
                        <span className="text-[13px]">{s.first_name} {s.last_name}</span>
                      </div>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      {(() => {
                        const weekDays = data?.days ?? []
                        const offDays = weekDays.filter((d) => !d.assignments.some((a) => a.staff_id === s.id))
                        const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                        const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                        return <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                      })()}
                    </TapPopover>
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

import { GenerationStrategyModal, AIReasoningModal, SaveTemplateModal, ApplyTemplateModal } from "./calendar-panel/generation-modals"

// ── Main panel ────────────────────────────────────────────────────────────────

export function CalendarPanel(props: { refreshKey?: number; chatOpen?: boolean; initialData?: RotaWeekData; initialStaff?: StaffWithSkills[]; hasNotifications?: boolean; initialNotes?: import("@/app/(clinic)/notes-actions").WeekNoteData }) {
  return (
    <StaffHoverProvider>
      <CalendarPanelInner {...props} />
    </StaffHoverProvider>
  )
}

function CalendarPanelInner({ refreshKey = 0, chatOpen = false, initialData, initialStaff, hasNotifications = false, initialNotes }: { refreshKey?: number; chatOpen?: boolean; initialData?: RotaWeekData; initialStaff?: StaffWithSkills[]; hasNotifications?: boolean; initialNotes?: import("@/app/(clinic)/notes-actions").WeekNoteData }) {
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
  const [personSimplified, setPersonSimplified] = useState(() => {
    if (typeof window === "undefined") return true
    const stored = localStorage.getItem("labrota_person_simplified")
    return stored === null ? true : stored === "true" // default true
  })
  const [daysAsRows, setDaysAsRows] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("labrota_days_as_rows") === "true"
  })
  const [colorChips, setColorChips] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem("labrota_color_chips") !== "false"
  })
  const { enabled: highlightHover, setEnabled: setHighlightHover } = useStaffHover()

  // Favorite views (desktop + mobile) — synced to DB, cached in localStorage
  type FavoriteView = { view: string; calendarLayout: string; daysAsRows: boolean; compact: boolean; colorChips: boolean; highlightEnabled: boolean }
  type MobileFavoriteView = { viewMode: string; compact: boolean; deptColor: boolean }
  const [favoriteView, setFavoriteView] = useState<FavoriteView | null>(() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(localStorage.getItem("labrota_favorite_view") ?? "null") } catch { return null }
  })
  const [mobileFavoriteView, setMobileFavoriteView] = useState<MobileFavoriteView | null>(() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(localStorage.getItem("labrota_mobile_favorite_view") ?? "null") } catch { return null }
  })
  const [currentDate, setCurrentDateState] = useState(() => {
    // When SSR provides initialData, start on that week to avoid a mismatch
    // that would discard the pre-fetched data and trigger a redundant client fetch
    if (initialData?.weekStart) {
      const firstDay = initialData.weekStart
      return firstDay
    }
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

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  type UndoEntry = {
    snapshot: RotaWeekData
    forwardSnapshot?: RotaWeekData // snapshot to restore on redo (optimistic)
    inverse: () => Promise<{ error?: string }>
    forward: () => Promise<{ error?: string }>
  }
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)
  const [showSaved, setShowSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [monthSummary, setMonthSummary] = useState<RotaMonthSummary | null>(null)
  const [loadingWeek, setLoadingWeek]   = useState(true)
  const [activeStrategy, setActiveStrategy] = useState<GenerationStrategy | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [showReasoningModal, setShowReasoningModal] = useState(false)
  const aiReasoningRef = useRef<string | null>(null) // preserve reasoning across fetches
  const reasoningSourceRef = useRef<"claude" | "hybrid" | null>(null)
  const [multiWeekScope, setMultiWeekScope] = useState<string[] | null>(null) // week starts to generate
  const [showMultiWeekDialog, setShowMultiWeekDialog] = useState(false)
  const [showCopyConfirm, setShowCopyConfirm] = useState(false)
  const [prevWeekHasRota, setPrevWeekHasRota] = useState(false)
  const [isPending, startTransition]    = useTransition()

  // Staff for assignment sheet
  const [staffList, setStaffList] = useState<StaffWithSkills[]>([])
  const [staffLoaded, setStaffLoaded] = useState(false)

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
  const [dayWarningsOpen, setDayWarningsOpen] = useState(false)
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

  // Swap state for desktop viewers
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<{ id: string; shiftType: string; date: string } | null>(null)
  const desktopSwapEnabled = !canEdit && viewerStaffId && weekData?.enableSwapRequests && weekData?.rota?.status === "published"


  function openProfile(staffId: string) {
    setProfileStaffId(staffId)
    setProfileOpen(true)
  }

  // For desktop viewers: intercept chip click on their own assignments to open swap dialog
  function handleDesktopChipClick(assignment: { id?: string; staff_id: string; shift_type?: string }, date: string) {
    if (desktopSwapEnabled && assignment.staff_id === viewerStaffId && assignment.id && assignment.shift_type && date) {
      setSwapAssignment({ id: assignment.id, shiftType: assignment.shift_type, date })
      setSwapDialogOpen(true)
    } else {
      openProfile(assignment.staff_id)
    }
  }

  // DnD state
  const [draggingId, setDraggingId]     = useState<string | null>(null)
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  // Local punctions override
  const [punctionsOverride, setPunctionsOverrideLocal] = useState<Record<string, number>>({})

  // Handle biopsy override: back-calculate punction adjustments for D-5 and D-6
  // Formula: since d5Pct + d6Pct = 1, ΔP = ΔBiopsies / conversionRate
  function handleBiopsyChange(date: string, biopsyNew: number) {
    const cr = weekData?.biopsyConversionRate ?? monthSummary?.biopsyConversionRate ?? 0.5
    const d5Pct = weekData?.biopsyDay5Pct ?? monthSummary?.biopsyDay5Pct ?? 0.5
    const d6Pct = weekData?.biopsyDay6Pct ?? monthSummary?.biopsyDay6Pct ?? 0.5
    const pd = weekData?.punctionsDefault ?? {}

    const d = new Date(date + "T12:00:00")
    const d5 = new Date(d); d5.setDate(d5.getDate() - 5); const d5str = d5.toISOString().split("T")[0]
    const d6 = new Date(d); d6.setDate(d6.getDate() - 6); const d6str = d6.toISOString().split("T")[0]

    const P5 = punctionsOverride[d5str] ?? pd[d5str] ?? monthSummary?.days.find((dd) => dd.date === d5str)?.punctions ?? 0
    const P6 = punctionsOverride[d6str] ?? pd[d6str] ?? monthSummary?.days.find((dd) => dd.date === d6str)?.punctions ?? 0

    const bForecast = Math.round(P5 * cr * d5Pct + P6 * cr * d6Pct)
    const delta = biopsyNew - bForecast
    if (Math.abs(delta) < 0.5 || cr === 0) return

    const pDelta = delta / cr  // distribute equally since d5Pct + d6Pct = 1
    const P5new = Math.max(0, Math.round(P5 + pDelta))
    const P6new = Math.max(0, Math.round(P6 + pDelta))

    setPunctionsOverrideLocal((prev) => ({ ...prev, [d5str]: P5new, [d6str]: P6new }))
  }

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
  const initialDataUsed = useRef(false)
  const weekCache = useRef<Map<string, RotaWeekData>>(new Map())
  // Stable ref so fetchWeek doesn't depend on initialData prop identity
  // (avoids double-fetch when streaming causes initialData to change reference)
  const initialDataRef = useRef<RotaWeekData | undefined>(initialData)
  useEffect(() => { initialDataRef.current = initialData }, [initialData])

  function weekOffset(ws: string, days: number): string {
    const dt = new Date(ws + "T12:00:00"); dt.setDate(dt.getDate() + days); return dt.toISOString().split("T")[0]
  }

  function prefetchAdjacent(ws: string) {
    const prev = weekOffset(ws, -7)
    const next = weekOffset(ws, 7)
    if (!weekCache.current.has(prev)) {
      getRotaWeek(prev).then((d) => { weekCache.current.set(prev, d) }).catch(() => {})
    }
    if (!weekCache.current.has(next)) {
      getRotaWeek(next).then((d) => { weekCache.current.set(next, d) }).catch(() => {})
    }
  }

  const fetchWeek = useCallback((ws: string) => {
    // On first call, if the server pre-fetched this exact week, use it directly
    // (avoids a network round-trip on initial load for new sessions viewing today's week)
    const initialData = initialDataRef.current
    if (!initialDataUsed.current && initialData?.weekStart === ws) {
      initialDataUsed.current = true
      weekCache.current.set(ws, initialData)
      setInitialLoaded(true)
      setWeekData(initialData)
      setPunctionsOverrideLocal(initialData.rota?.punctions_override ?? {})
      setLoadingWeek(false)
      prefetchAdjacent(ws)
      return
    }

    // Cache hit — show instantly, then silently refresh in background
    const cached = weekCache.current.get(ws)
    if (cached) {
      setInitialLoaded(true)
      setWeekData(cached)
      setPunctionsOverrideLocal(cached.rota?.punctions_override ?? {})
      setLoadingWeek(false)
      setLiveDays(null)
      setError(null)
      aiReasoningRef.current = null
      reasoningSourceRef.current = null
      setActiveStrategy(null)
      getRotaWeek(ws).then((d) => {
        weekCache.current.set(ws, d)
        setWeekData(d)
        setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
        prefetchAdjacent(ws)
      }).catch(() => {})
      return
    }

    const version = ++fetchVersionRef.current
    aiReasoningRef.current = null
    reasoningSourceRef.current = null
    setActiveStrategy(null)
    setLoadingWeek(true)
    setLiveDays(null)
    setError(null)
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out. Please refresh.")), 15000))
    Promise.race([getRotaWeek(ws), timeout]).then((d) => {
      if (fetchVersionRef.current !== version) return
      weekCache.current.set(ws, d)
      setInitialLoaded(true)
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
      setLoadingWeek(false)
      prefetchAdjacent(ws)
    }).catch((e: unknown) => {
      if (fetchVersionRef.current !== version) return
      setInitialLoaded(true)
      setWeekData(null)
      setError(e instanceof Error ? e.message : "Failed to load schedule data.")
      setLoadingWeek(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — reads initialData via ref to stay stable

  // Silent refresh — used after drag-drop so the grid doesn't flash skeleton
  // lastFetchId lets us discard results from fetches that were superseded (e.g. by Undo)
  const lastFetchId = useRef(0)
  const fetchWeekSilent = useCallback((ws: string) => {
    const id = ++lastFetchId.current
    getRotaWeek(ws).then((d) => {
      if (id !== lastFetchId.current) return // stale — a newer fetch is in flight
      weekCache.current.set(ws, d)
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
    }).catch(() => {/* ignore — grid stays as-is */})
  }, [])

  // ── Undo/Redo helpers ──────────────────────────────────────────────────────
  function triggerSaved() {
    setShowSaved(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000)
  }

  function cancelLastUndo() {
    undoStack.current.pop()
    setUndoLen(undoStack.current.length)
  }

  function pushUndo(
    snapshot: RotaWeekData,
    inverse: () => Promise<{ error?: string }>,
    forward: () => Promise<{ error?: string }>,
  ) {
    undoStack.current = [...undoStack.current.slice(-19), { snapshot, inverse, forward }]
    redoStack.current = []
    setUndoLen(undoStack.current.length)
    setRedoLen(0)
  }

  async function handleUndo() {
    const entry = undoStack.current.pop()
    if (!entry) return
    const currentData = weekData
    if (currentData) {
      // Store current state so redo can apply it optimistically
      redoStack.current = [...redoStack.current, { snapshot: entry.snapshot, forwardSnapshot: currentData, inverse: entry.inverse, forward: entry.forward }]
      setRedoLen(redoStack.current.length)
    }
    // Bump lastFetchId so any pending debounced refresh is discarded
    lastFetchId.current++
    setWeekData(entry.snapshot)
    setUndoLen(undoStack.current.length)
    const result = await entry.inverse()
    if (result?.error) {
      toast.error(locale === "es" ? "Error al deshacer" : "Undo failed")
    }
    // Always re-fetch after inverse to get authoritative server state
    fetchWeekSilent(weekStart)
  }

  async function handleRedo() {
    const entry = redoStack.current.pop()
    if (!entry) return
    const currentData = weekData
    // Apply optimistic forward snapshot immediately (like undo does)
    if (entry.forwardSnapshot) {
      lastFetchId.current++
      setWeekData(entry.forwardSnapshot)
    }
    if (currentData) {
      undoStack.current = [...undoStack.current.slice(-19), { snapshot: currentData, forwardSnapshot: entry.forwardSnapshot, inverse: entry.inverse, forward: entry.forward }]
      setUndoLen(undoStack.current.length)
    }
    setRedoLen(redoStack.current.length)
    const result = await entry.forward()
    if (result?.error) {
      toast.error(locale === "es" ? "Error al rehacer" : "Redo failed")
    }
    fetchWeekSilent(weekStart)
  }

  // Clear stacks when navigating weeks
  useEffect(() => {
    undoStack.current = []
    redoStack.current = []
    setUndoLen(0)
    setRedoLen(0)
  }, [weekStart])

  // Keyboard shortcuts — Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); handleRedo() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }) // intentionally no deps — closures must see latest stack state

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

  // Apply favorite view on first mount — only if no session-stored view exists
  const favAppliedRef = useRef(false)
  useEffect(() => {
    if (favAppliedRef.current || !favoriteView) return
    favAppliedRef.current = true
    // Only apply the favorite view mode if there's no session-stored value (i.e. new tab, not a refresh)
    const sessionView = typeof window !== "undefined" ? sessionStorage.getItem("labrota_view") : null
    if (!sessionView) setView(favoriteView.view as ViewMode)
    setCalendarLayout(favoriteView.calendarLayout as CalendarLayout)
    setDaysAsRows(favoriteView.daysAsRows)
    setCompact(favoriteView.compact)
    setColorChips(favoriteView.colorChips)
    setHighlightHover(favoriteView.highlightEnabled)
  }, [favoriteView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply mobile favorite view on first mount
  const mobileFavAppliedRef = useRef(false)
  useEffect(() => {
    if (mobileFavAppliedRef.current || !mobileFavoriteView) return
    mobileFavAppliedRef.current = true
    setMobileViewMode(mobileFavoriteView.viewMode as "shift" | "person")
    setMobileCompact(mobileFavoriteView.compact)
    setMobileDeptColor(mobileFavoriteView.deptColor)
  }, [mobileFavoriteView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync favorite views from DB when localStorage is empty (new browser)
  useEffect(() => {
    const hasDesktop = localStorage.getItem("labrota_favorite_view")
    const hasMobile = localStorage.getItem("labrota_mobile_favorite_view")
    if (hasDesktop && hasMobile) return
    getUserPreferences().then((prefs) => {
      if (!hasDesktop && prefs.favoriteView) {
        localStorage.setItem("labrota_favorite_view", JSON.stringify(prefs.favoriteView))
        setFavoriteView(prefs.favoriteView as FavoriteView)
      }
      if (!hasMobile && prefs.mobileFavoriteView) {
        localStorage.setItem("labrota_mobile_favorite_view", JSON.stringify(prefs.mobileFavoriteView))
        setMobileFavoriteView(prefs.mobileFavoriteView as MobileFavoriteView)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const initialStaffUsed = useRef(false)
  useEffect(() => {
    if (!initialStaffUsed.current && initialStaff && initialStaff.length > 0) {
      initialStaffUsed.current = true
      setStaffList(initialStaff)
      setStaffLoaded(true)
      return
    }
    const staffTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Staff load timed out")), 15000))
    Promise.race([getActiveStaff(), staffTimeout]).then((s) => { setStaffList(s); setStaffLoaded(true) }).catch(() => { setStaffLoaded(true) })
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // 4-week view: always show scope dialog so user can pick scope
      setShowMultiWeekDialog(true)
      return
    }
    setShowStrategyModal(true)
  }

  function handleStrategyGenerate(strategy: GenerationStrategy, templateId?: string) {
    setShowStrategyModal(false)
    const weeksToGenerate = multiWeekScope ?? [weekStart]
    setMultiWeekScope(null)

    setActiveStrategy(strategy)
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
          } else if (strategy === "flexible_template" && templateId) {
            const result = await applyTemplate(templateId, ws, true)
            if (result.error) { errorMsg = result.error; break }
            successCount++
          } else if (strategy === "ai_hybrid") {
            const result = await generateRotaHybrid(ws, false)
            if (result.error) { errorMsg = result.error; break }
            if (result.reasoning) {
              aiReasoningRef.current = result.reasoning
              reasoningSourceRef.current = "hybrid"
            }
            successCount++
          } else if (strategy === "ai_reasoning") {
            const result = await generateRotaWithAI(ws, false)
            if (result.error) { errorMsg = result.error; break }
            if (result.reasoning) {
              aiReasoningRef.current = result.reasoning
              reasoningSourceRef.current = "claude"
            }
            successCount++
          } else if (strategy === "ai_optimal") {
            // Route to the engine version configured for this org + display mode
            const isByTask = weekData?.rotaDisplayMode === "by_task"
            const version = isByTask
              ? (weekData?.engineConfig?.taskOptimalVersion ?? "v1")
              : (weekData?.engineConfig?.aiOptimalVersion ?? "v2")
            const genType = version === "v1" ? "ai_optimal" : "ai_optimal_v2"
            const result = await generateRota(ws, false, genType)
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
        const raw = e instanceof Error ? e.message : String(e)
        const isTimeout = /failed to fetch|timeout|aborted|network/i.test(raw)
        const msg = isTimeout ? t("generatingTimeout") : raw || t("generatingError")
        setError(msg)
        toast.error(msg)
      } finally {
        setActiveStrategy(null)
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
  const hasWeekAssignments = weekData?.days.some((d) => d.assignments.length > 0) ?? false
  const hasMonthAssignments = monthSummary?.days.some((d) => d.staffCount > 0) ?? false
  const hasAssignments = view === "month" ? hasMonthAssignments : hasWeekAssignments
  const anyMonthWeekPublished = monthSummary?.weekStatuses?.some((ws) => ws.status === "published") ?? false
  const hasSkillGaps   = hasAssignments && (weekData?.days.some((d) => d.skillGaps.length > 0) ?? false)
  // Show task assignment UI only in by_task mode, or in by_shift when the feature flag is on
  const showTaskAssignment = weekData?.rotaDisplayMode === "by_task" || (weekData?.enableTaskInShift ?? false)
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null
  const showActions    = canEdit

  const sheetDay = sheetDate ? (weekData?.days.find((d) => d.date === sheetDate) ?? null) : null

  // Stable callbacks for child components — avoid re-creating on every render
  const toggleMobileCompact = useCallback(() => {
    setMobileCompact((prev) => { const next = !prev; localStorage.setItem("labrota_mobile_compact", String(next)); return next })
  }, [])
  const toggleMobileDeptColor = useCallback(() => {
    setMobileDeptColor((prev) => { const next = !prev; localStorage.setItem("labrota_mobile_dept_color", String(next)); return next })
  }, [])
  const toggleHighlightHover = useCallback(() => setHighlightHover(!highlightHover), [highlightHover, setHighlightHover])
  const togglePersonSimplified = useCallback(() => {
    setPersonSimplified((prev) => { const next = !prev; localStorage.setItem("labrota_person_simplified", String(next)); return next })
  }, [])
  const toggleColorChips = useCallback(() => {
    setColorChips((prev) => { const next = !prev; localStorage.setItem("labrota_color_chips", String(next)); return next })
  }, [])
  const toggleDaysAsRows = useCallback(() => {
    setDaysAsRows((prev) => { const next = !prev; localStorage.setItem("labrota_days_as_rows", String(next)); return next })
  }, [])

  // On first load, show inline skeleton so the panel occupies space
  // and the chat panel doesn't appear alone before the calendar.
  if (!initialLoaded && !staffLoaded) return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="hidden lg:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-16 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-4 w-40 rounded" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-20 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </div>
      <div className="flex-1 px-4 py-2 overflow-hidden">
        <div className="grid grid-cols-7 gap-px mb-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center py-2">
              <Skeleton className="h-3 w-8 rounded mb-1" />
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="grid grid-cols-7 gap-px mb-2">
            {Array.from({ length: 7 }).map((_, col) => (
              <div key={col} className="flex flex-col gap-1 p-1.5">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-5 w-full rounded" />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  )

  return (
    <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
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
          <WeekJumpButton
            currentDate={currentDate}
            weekStart={weekStart}
            view={view}
            locale={locale}
            onSelect={(date) => { setCurrentDate(date); setShowStrategyModal(false) }}
          />
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

        {/* RIGHT: saved · undo/redo · dept filter · warnings · generate · overflow ··· */}
        <div className="flex items-center gap-2 shrink-0">
          {view === "week" && canEdit && (
            <div className="flex items-center gap-0.5">
              <span className={cn(
                "text-[12px] text-muted-foreground flex items-center gap-1 transition-opacity duration-700 select-none pr-1",
                showSaved ? "opacity-100" : "opacity-0 pointer-events-none"
              )}>
                <Check className="size-3 text-emerald-500" />
                {locale === "es" ? "Guardado" : "Saved"}
              </span>
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={handleUndo}
                    disabled={undoLen === 0}
                    className="rounded-md w-[30px] h-[28px] flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Undo2 className="size-[14px]" />
                  </button>
                } />
                <TooltipContent side="bottom">Undo (⌘Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={handleRedo}
                    disabled={redoLen === 0}
                    className="rounded-md w-[30px] h-[28px] flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Redo2 className="size-[14px]" />
                  </button>
                } />
                <TooltipContent side="bottom">Redo (⌘⇧Z)</TooltipContent>
              </Tooltip>
            </div>
          )}
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
          {(weekData?.aiReasoning || aiReasoningRef.current) && hasAssignments && view !== "month" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReasoningModal(true)}
              title={t("viewAiReasoning")}
              className="h-8 gap-1.5 shrink-0"
            >
              <BrainCircuit className="size-3.5" />
              <span className="hidden sm:inline">{t("aiInsights")}</span>
            </Button>
          )}
          {showActions && (view === "month" ? !anyMonthWeekPublished || monthSummary?.weekStatuses?.some((ws) => ws.status !== "published") : !isPublished) && (
            <Button variant="outline" size="sm" onClick={handleGenerateClick} disabled={isPending} className="h-8 shrink-0">
              {isPending ? tc("generating") : hasAssignments ? t("regenerateRota") : t("generateRota")}
            </Button>
          )}
          {(showActions || hasAssignments) && (
            <OverflowMenu items={[
              // ── Group 1: Actions (publish) ──
              ...(canEdit && isDraft && hasAssignments && view === "week" ? [{
                label: hasNotifications ? t("publishRota") : t("publishOnly"),
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
              // ── Export ──
              ...(hasAssignments && view === "week" ? [{
                label: t("exportPdf"),
                icon: <FileText className="size-3.5" />,
                dividerBefore: true,
                sectionLabel: locale === "es" ? "Exportar" : "Export",
                onClick: () => {
                  if (!weekData) return
                  import("@/lib/export-pdf").then(({ exportPdfByShift, exportPdfByPerson, exportPdfByTask }) => {
                    const on = document.querySelector("[data-org-name]")?.textContent ?? "LabRota"
                    const notesEl = document.querySelector("[data-week-notes]")
                    const noteTexts = notesEl
                      ? Array.from(notesEl.querySelectorAll("[data-note-text]")).map((el) => el.textContent ?? "").filter(Boolean)
                      : []
                    const n = noteTexts.length > 0 ? noteTexts : undefined
                    if (weekData.rotaDisplayMode === "by_task") {
                      exportPdfByTask(weekData, weekData.tecnicas ?? [], on, locale, n, daysAsRows)
                    } else if (calendarLayout === "person") {
                      exportPdfByPerson(weekData, on, locale, n, daysAsRows)
                    } else {
                      exportPdfByShift(weekData, on, locale, n, daysAsRows)
                    }
                  })
                },
              }, {
                label: t("exportExcel"),
                icon: <Sheet className="size-3.5" />,
                onClick: () => {
                  if (!weekData) return
                  import("@/lib/export-excel").then(({ exportWeekByShift, exportWeekByPerson, exportWeekByTask }) => {
                    if (weekData.rotaDisplayMode === "by_task") {
                      exportWeekByTask(weekData, weekData.tecnicas ?? [], locale, daysAsRows)
                    } else if (calendarLayout === "person") {
                      exportWeekByPerson(weekData, locale, daysAsRows)
                    } else {
                      exportWeekByShift(weekData, locale, daysAsRows)
                    }
                  })
                },
              }] : []),
              // ── Templates ──
              ...(view === "week" && canEdit && hasAssignments ? [{
                label: t("saveAsTemplate"),
                icon: <BookmarkPlus className="size-3.5" />,
                onClick: () => setSaveTemplateOpen(true),
                dividerBefore: true,
                sectionLabel: locale === "es" ? "Plantillas" : "Templates",
              }, ...(!isPublished ? [{
                label: t("applyTemplate"),
                icon: <BookmarkCheck className="size-3.5" />,
                onClick: () => setApplyTemplateOpen(true),
              }] : [])] : view === "week" && canEdit && !isPublished ? [{
                label: t("applyTemplate"),
                icon: <BookmarkCheck className="size-3.5" />,
                onClick: () => setApplyTemplateOpen(true),
                dividerBefore: true,
                sectionLabel: locale === "es" ? "Plantillas" : "Templates",
              }] : []),
              // ── View options ──
              ...((view === "week" || (view === "month" && calendarLayout === "person")) ? [
              ...(view === "week" ? [{
                label: t("daysAsRows"),
                icon: <ArrowRightLeft className="size-3.5" />,
                onClick: toggleDaysAsRows,
                active: daysAsRows,
                dividerBefore: true,
                sectionLabel: locale === "es" ? "Personalización" : "View",
              }] : []),
              ...(!(view === "month" && calendarLayout === "person") ? [{
                label: t("compactView"),
                icon: <Rows3 className="size-3.5" />,
                onClick: () => setCompact((c) => !c),
                active: compact,
              },
              {
                label: locale === "es" ? "Vista simplificada" : "Simplified view",
                icon: <LayoutList className="size-3.5" />,
                onClick: togglePersonSimplified,
                active: personSimplified,
              }] : []),
              {
                label: t("staffColors"),
                icon: <span className="size-3.5 rounded-full bg-gradient-to-br from-amber-400 via-blue-400 to-emerald-400 shrink-0" />,
                onClick: toggleColorChips,
                active: colorChips,
                ...(view === "month" && calendarLayout === "person" ? { dividerBefore: true, sectionLabel: locale === "es" ? "Personalización" : "View" } : {}),
              }, {
                label: t("highlightPerson"),
                icon: <span className="size-3.5 rounded-sm shrink-0" style={{ backgroundColor: "#FDE047" }} />,
                onClick: toggleHighlightHover,
                active: highlightHover,
              }] : []),
              // ── Favorite view ──
              ...(() => {
                const isFav = favoriteView
                  && favoriteView.view === view
                  && favoriteView.calendarLayout === calendarLayout
                  && favoriteView.daysAsRows === daysAsRows
                  && favoriteView.compact === compact
                  && favoriteView.colorChips === colorChips
                  && favoriteView.highlightEnabled === highlightHover
                const saveFavItem = {
                  label: t("saveFavoriteView"),
                  icon: <Star className="size-3.5" />,
                  onClick: () => {
                    const fav = { view, calendarLayout, daysAsRows, compact, colorChips, highlightEnabled: highlightHover }
                    setFavoriteView(fav)
                    localStorage.setItem("labrota_favorite_view", JSON.stringify(fav))
                    saveUserPreferences({ favoriteView: fav })
                    toast.success(t("favoriteViewSaved"))
                  },
                }
                // When on favorite → nothing shown. When not on favorite → show go-to (if exists) + save.
                if (isFav) return []
                if (favoriteView) return [{
                  label: t("goToFavoriteView"),
                  icon: <Star className="size-3.5 text-amber-400 fill-amber-400" />,
                  dividerBefore: true,
                  onClick: () => {
                    setView(favoriteView.view as ViewMode)
                    setCalendarLayout(favoriteView.calendarLayout as CalendarLayout)
                    setDaysAsRows(favoriteView.daysAsRows)
                    setCompact(favoriteView.compact)
                    setColorChips(favoriteView.colorChips)
                    setHighlightHover(favoriteView.highlightEnabled)
                  },
                }, saveFavItem]
                return [{ ...saveFavItem, dividerBefore: true }]
              })(),
              // ── History ──
              ...(view === "week" && hasAssignments ? [{
                label: t("viewHistory"),
                icon: <Clock className="size-3.5" />,
                onClick: () => setHistoryOpen(true),
                dividerBefore: true,
              }] : []),
              // ── Destructive ──
              ...(canEdit && hasAssignments && !(view === "month" ? anyMonthWeekPublished : isPublished) ? [{
                label: view === "month" ? t("delete4Weeks") : t("deleteRota"),
                icon: <Trash2 className="size-3.5" />,
                onClick: () => {
                  const msg = view === "month"
                    ? t("confirm4WeeksDelete")
                    : t("deleteWeekConfirm")
                  if (confirm(msg)) {
                    if (view === "month") setLoadingMonth(true)
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
            <div data-calendar-content className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative" style={{ minHeight: 400 }}>
              {/* Shimmer — replaces content during loading (also wait for staffList on first load) */}
              {(loadingWeek || !staffLoaded) && (
                <div className="absolute inset-0 z-10 bg-background flex flex-col">
                  {weekData?.rotaDisplayMode === "by_task" ? (
                    <TaskGrid data={null} staffList={[]} loading locale={locale} isPublished={false} onRefresh={() => {}} taskConflictThreshold={3} punctionsDefault={{}} punctionsOverride={{}} onPunctionsChange={() => {}} compact={compact} colorBorders={colorChips} showPuncBiopsy={false} />
                  ) : calendarLayout === "person" ? (
                    <PersonGrid data={null} staffList={[]} loading locale={locale} isPublished={false} shiftTimes={null} onLeaveByDate={{}} publicHolidays={{}} onChipClick={() => {}} simplified={personSimplified} />
                  ) : (
                    <ShiftGrid data={null} staffList={[]} loading locale={locale} onCellClick={() => {}} onChipClick={() => {}} isPublished={false} shiftTimes={null} onLeaveByDate={{}} publicHolidays={{}} punctionsDefault={{}} punctionsOverride={{}} onPunctionsChange={() => {}} onRefresh={() => {}} weekStart={weekStart} compact={compact} colorChips={colorChips} />
                  )}
                  {activeStrategy === "ai_hybrid" && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-6 text-primary animate-pulse" />
                        <span className="text-muted-foreground">+</span>
                        <BrainCircuit className="size-6 text-purple-500 animate-pulse" />
                      </div>
                      <p className="text-[14px] font-medium text-foreground">{t("hybridGenerating")}</p>
                      <p className="text-[12px] text-muted-foreground max-w-xs text-center">{t("hybridGeneratingDesc")}</p>
                    </div>
                  )}
                  {activeStrategy === "ai_reasoning" && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
                      <BrainCircuit className="size-8 text-amber-500 animate-pulse" />
                      <p className="text-[14px] font-medium text-foreground">{t("claudeThinking")}</p>
                      <p className="text-[12px] text-muted-foreground max-w-xs text-center">{t("claudeThinkingDesc")}</p>
                    </div>
                  )}
                  {(activeStrategy === "ai_optimal" || activeStrategy === "ai_optimal_v2") && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
                      <Sparkles className="size-8 text-primary animate-pulse" />
                      <p className="text-[14px] font-medium text-foreground">{t("engineGenerating")}</p>
                      <p className="text-[12px] text-muted-foreground">{t("engineGeneratingDesc")}</p>
                    </div>
                  )}
                </div>
              )}
              {weekData && (weekData.rotaDisplayMode === "by_task" && calendarLayout === "person" ? (
                <TaskPersonGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  compact={compact}
                  colorChips={colorChips}
                  onChipClick={openProfile}
                  onDateClick={handleMonthDayClick}
                />
              ) : weekData.rotaDisplayMode === "by_task" && daysAsRows ? (
                <TransposedTaskGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  compact={compact}
                  colorChips={colorChips}
                  onRemoveAssignment={async (id) => {
                    const snapshot = weekData
                    const assignment = weekData?.days.flatMap((d) => d.assignments.map((a) => ({ ...a, date: d.date }))).find((a) => a.id === id)
                    const result = await removeAssignment(id)
                    if (result.error) { toast.error(result.error); return }
                    fetchWeekSilent(weekStart)
                    if (snapshot && assignment && canEdit) {
                      pushUndo(
                        snapshot,
                        () => upsertAssignment({ weekStart, staffId: assignment.staff_id, date: assignment.date, shiftType: assignment.shift_type, functionLabel: assignment.function_label ?? undefined }),
                        () => removeAssignment(id),
                      )
                    }
                  }}
                  onCellClick={(date, tecCode) => {
                    setSheetDate(date)
                    setSheetOpen(true)
                  }}
                  onChipClick={openProfile}
                  onDateClick={handleMonthDayClick}
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
                  onAfterMutation={canEdit ? pushUndo : undefined}
                  onCancelUndo={canEdit ? cancelLastUndo : undefined}
                  onSaved={canEdit ? triggerSaved : undefined}
                  taskConflictThreshold={weekData?.taskConflictThreshold ?? 3}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={handlePunctionsChange}
                  onBiopsyChange={handleBiopsyChange}
                  biopsyConversionRate={weekData?.biopsyConversionRate}
                  biopsyDay5Pct={weekData?.biopsyDay5Pct}
                  biopsyDay6Pct={weekData?.biopsyDay6Pct}
                  shiftLabel={weekData?.shiftTypes?.[0] ? `${weekData.shiftTypes[0].start_time} – ${weekData.shiftTypes[0].end_time}` : undefined}
                  compact={compact}
                  colorBorders={colorChips}
                  showPuncBiopsy={!compact}
                  onDateClick={handleMonthDayClick}
                  onChipClick={openProfile}
                />
              ) : (!weekData.rota || !weekData.days.some((d) => d.assignments.length > 0)) ? (
                <div className="flex-1 flex items-start justify-center pt-[18vh]">
                  {!canEdit ? (
                    <div className="flex flex-col items-center gap-3 w-full max-w-[380px] text-center">
                      <CalendarDays className="size-10 text-muted-foreground/40" />
                      <p className="text-[16px] font-medium text-muted-foreground">{t("noRotaYet")}</p>
                      <p className="text-[14px] text-muted-foreground/70">{t("noRotaYetDescription")}</p>
                    </div>
                  ) : (
                  <div className="flex flex-col items-center gap-5 w-full max-w-[420px]">
                    <Sparkles className="size-12" style={{ color: "var(--pref-bg)" }} />
                    <div className="text-center">
                      <p className="text-[18px] font-semibold" style={{ color: "var(--pref-bg)" }}>{t("emptyWeekTitle")}</p>
                      <p className="text-[14px] text-muted-foreground mt-2 max-w-[380px] mx-auto leading-relaxed">
                        {t("emptyWeekDesc")}
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
                  )}
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
                  onCellClick={(date) => { setSheetDate(date); setSheetOpen(true) }}
                  onChipClick={(a, date) => handleDesktopChipClick(a, date)}
                  onRefresh={() => fetchWeekSilent(weekStart)}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
                />
              ) : calendarLayout === "shift" ? (
                <ShiftGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  loading={false}
                  isGenerating={isPending}
                  locale={locale}
                  onCellClick={() => {}}
                  onChipClick={(a, date) => handleDesktopChipClick(a, date)}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={handlePunctionsChange}
                  onBiopsyChange={handleBiopsyChange}
                  onRefresh={() => fetchWeekSilent(weekStart)}
                  onAfterMutation={canEdit ? pushUndo : undefined}
                  onCancelUndo={canEdit ? cancelLastUndo : undefined}
                  onSaved={canEdit ? triggerSaved : undefined}
                  weekStart={weekStart}
                  compact={compact}
                  colorChips={colorChips}
                  simplified={personSimplified}
                  onDateClick={handleMonthDayClick}
                  onLocalDaysChange={setLiveDays}
                  ratioOptimal={weekData?.ratioOptimal}
                  ratioMinimum={weekData?.ratioMinimum}
                  timeFormat={weekData?.timeFormat}
                  biopsyConversionRate={weekData?.biopsyConversionRate}
                  biopsyDay5Pct={weekData?.biopsyDay5Pct}
                  biopsyDay6Pct={weekData?.biopsyDay6Pct}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
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
                  onChipClick={(a, date) => handleDesktopChipClick(a, date)}
                  onDateClick={handleMonthDayClick}
                  colorChips={colorChips}
                  compact={compact}
                  simplified={personSimplified}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
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
                  onChipClick={(a, date) => handleDesktopChipClick(a, date)}
                  onDateClick={handleMonthDayClick}
                  colorChips={colorChips}
                  compact={compact}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
                  simplified={personSimplified}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
                />
              ))}
            </div>
          </div>
        )}

        {/* Month view */}
        {view === "month" && (
          <div className="hidden md:flex flex-col flex-1 overflow-auto px-4 py-3">
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
              onBiopsyChange={canEdit ? handleBiopsyChange : undefined}
              monthViewMode={monthViewMode}
              colorChips={colorChips}
            />
          </div>
        )}

        {/* Mobile: day view (all users) */}
        <div className={cn("flex flex-col overflow-auto lg:hidden flex-1")}>
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
            <div data-mobile-toolbar className="flex items-center gap-1 h-14 px-2 border-b border-border bg-background lg:hidden sticky top-0 z-20">
              {/* Left: date selector */}
              <button onClick={() => setCurrentDate((d) => addDays(d, -1))} className="size-9 flex items-center justify-center rounded-full active:bg-accent shrink-0">
                <ChevronLeft className="size-[18px] text-muted-foreground" />
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
              <button onClick={() => setCurrentDate((d) => addDays(d, 1))} className="size-9 flex items-center justify-center rounded-full active:bg-accent shrink-0">
                <ChevronRight className="size-[18px] text-muted-foreground" />
              </button>
              <button
                onClick={goToToday}
                disabled={currentDate === TODAY}
                className={cn("text-[12px] font-medium px-1.5 py-1 rounded-md transition-colors shrink-0", currentDate === TODAY ? "text-muted-foreground/30" : "text-primary active:bg-primary/10")}
              >
                {tc("today")}
              </button>
              <div className="flex-1" />
              {/* Day status icon — tappable, opens warnings panel */}
              {currentDayData && currentDayData.assignments.length > 0 && (
                <button onClick={() => setDayWarningsOpen(true)} className="size-10 flex items-center justify-center rounded-full active:bg-accent shrink-0">
                  {currentDayData.skillGaps.length > 0 || currentDayData.warnings.length > 0
                    ? <AlertTriangle className="size-[18px] text-amber-500" />
                    : <Check className="size-[18px] text-emerald-500" />}
                </button>
              )}
              {canEdit && (
                <button onClick={() => { setPreEditSnapshot(weekData ? JSON.parse(JSON.stringify(weekData)) : null); setMobileEditMode(true) }} className="size-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent shrink-0">
                  <Pencil className="size-[18px]" />
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
                  onShare={undefined}
                  isPending={isPending}
                  compact={mobileCompact}
                  onToggleCompact={toggleMobileCompact}
                  deptColor={mobileDeptColor}
                  onToggleDeptColor={toggleMobileDeptColor}
                  isFavorite={!!(mobileFavoriteView && mobileFavoriteView.viewMode === mobileViewMode && mobileFavoriteView.compact === mobileCompact && mobileFavoriteView.deptColor === mobileDeptColor)}
                  hasFavorite={!!mobileFavoriteView}
                  onSaveFavorite={() => {
                    const fav: MobileFavoriteView = { viewMode: mobileViewMode, compact: mobileCompact, deptColor: mobileDeptColor }
                    setMobileFavoriteView(fav)
                    localStorage.setItem("labrota_mobile_favorite_view", JSON.stringify(fav))
                    saveUserPreferences({ mobileFavoriteView: fav })
                    toast.success(t("favoriteViewSaved"))
                  }}
                  onGoToFavorite={mobileFavoriteView ? () => {
                    setMobileViewMode(mobileFavoriteView.viewMode as "shift" | "person")
                    setMobileCompact(mobileFavoriteView.compact)
                    setMobileDeptColor(mobileFavoriteView.deptColor)
                  } : undefined}
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
                loading={loadingWeek || !staffLoaded || !currentDayData}
                locale={locale}
              />
            ) : (
              <DayView
                day={currentDayData}
                loading={loadingWeek || !staffLoaded || !currentDayData}
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
                punctions={currentDayData ? (punctionsOverride[currentDayData.date] ?? weekData?.punctionsDefault?.[currentDayData.date] ?? 0) : 0}
                biopsyForecast={(() => {
                  if (!currentDayData || !weekData) return 0
                  const pd = weekData.punctionsDefault ?? {}
                  const cr = weekData.biopsyConversionRate ?? 0.5
                  function getPunc(dateStr: string): number {
                    if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
                    if (pd[dateStr] !== undefined) return pd[dateStr]
                    const dow = new Date(dateStr + "T12:00:00").getDay()
                    const sameDow = Object.entries(pd).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
                    return sameDow ? sameDow[1] : 0
                  }
                  const d5 = new Date(currentDayData.date + "T12:00:00"); d5.setDate(d5.getDate() - 5)
                  const d6 = new Date(currentDayData.date + "T12:00:00"); d6.setDate(d6.getDate() - 6)
                  return Math.round(getPunc(d5.toISOString().split("T")[0]) * cr * (weekData.biopsyDay5Pct ?? 0.5) + getPunc(d6.toISOString().split("T")[0]) * cr * (weekData.biopsyDay6Pct ?? 0.5))
                })()}
                ratioOptimal={weekData?.ratioOptimal}
                ratioMinimum={weekData?.ratioMinimum}
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

      {/* Day warnings panel */}
      {dayWarningsOpen && currentDayData && createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden" onClick={() => setDayWarningsOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-background rounded-t-2xl shadow-xl px-4 pt-4 pb-8 max-h-[60vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[16px] font-semibold capitalize">{formatDate(currentDayData.date, locale as "es" | "en")}</span>
              <button onClick={() => setDayWarningsOpen(false)} className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            {currentDayData.skillGaps.length === 0 && currentDayData.warnings.length === 0 ? (
              <div className="flex items-center gap-2 py-3">
                <Check className="size-5 text-emerald-500 shrink-0" />
                <span className="text-[14px] text-emerald-600">{locale === "es" ? "Sin alertas para este día" : "No issues for this day"}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {currentDayData.skillGaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                    <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-medium text-red-700">{locale === "es" ? "Habilidad sin cubrir" : "Uncovered skill"}</p>
                      <p className="text-[13px] text-red-600">{gap}</p>
                    </div>
                  </div>
                ))}
                {currentDayData.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
                    <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-medium text-amber-700">{w.category === "coverage" ? (locale === "es" ? "Cobertura" : "Coverage") : w.category === "skill_gap" ? (locale === "es" ? "Habilidad" : "Skill") : (locale === "es" ? "Aviso" : "Warning")}</p>
                      <p className="text-[13px] text-amber-600">{w.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

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
        enableTaskInShift={weekData?.enableTaskInShift ?? false}
      />

      {/* Multi-week generation scope dialog */}
      {showMultiWeekDialog && monthSummary && (() => {
        const allWeekStarts: string[] = []
        for (let i = 0; i < monthSummary.days.length; i += 7) {
          if (monthSummary.days[i]) allWeekStarts.push(monthSummary.days[i].date)
        }
        const publishedSet = new Set(
          monthSummary.weekStatuses.filter((ws) => ws.status === "published").map((ws) => ws.weekStart)
        )
        const withRota = new Set(
          monthSummary.weekStatuses.filter((ws) => ws.status !== null).map((ws) => ws.weekStart)
        )
        const withoutRota = allWeekStarts.filter((ws) => !withRota.has(ws))
        // "Remaining" = weeks whose start date is >= today AND not published
        const remaining = allWeekStarts.filter((ws) => ws >= TODAY && !publishedSet.has(ws))
        const nonPublished = allWeekStarts.filter((ws) => !publishedSet.has(ws))
        const hasOptions = withoutRota.length > 0 || remaining.length > 0 || nonPublished.length > 0

        return (
          <>
            <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setShowMultiWeekDialog(false)} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[380px] p-5 flex flex-col gap-4">
              <p className="text-[15px] font-medium">
                {t("generate4WeeksTitle")}
              </p>

              {!hasOptions ? (
                <p className="text-[13px] text-muted-foreground">
                  {locale === "es" ? "Todas las semanas están publicadas." : "All weeks are published."}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Option 1: Generate only weeks without rota */}
                  {withoutRota.length > 0 && (
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
                  )}
                  {/* Option 2: Regenerate remaining (current + future) weeks */}
                  {remaining.length > 0 && remaining.length < nonPublished.length && (
                    <button
                      onClick={() => {
                        setShowMultiWeekDialog(false)
                        setMultiWeekScope(remaining)
                        setShowStrategyModal(true)
                      }}
                      className="relative w-full px-4 py-3 rounded-lg border border-border text-left hover:bg-muted/50 transition-colors"
                    >
                      {remaining.some((ws) => withRota.has(ws)) && (
                        <AlertTriangle className="size-4 text-amber-500 absolute top-2.5 right-2.5" />
                      )}
                      <p className="text-[14px] font-medium">{t("generateRemainingWeeks")}</p>
                      <p className="text-[12px] text-muted-foreground">{t("remainingWeeksDescription", { count: remaining.length })}</p>
                    </button>
                  )}
                  {/* Option 3: Regenerate all non-published weeks */}
                  {nonPublished.length > 0 && nonPublished.length > withoutRota.length && (
                    <button
                      onClick={() => {
                        setShowMultiWeekDialog(false)
                        setMultiWeekScope(nonPublished)
                        setShowStrategyModal(true)
                      }}
                      className="relative w-full px-4 py-3 rounded-lg border border-border text-left hover:bg-muted/50 transition-colors"
                    >
                      <AlertTriangle className="size-4 text-amber-500 absolute top-2.5 right-2.5" />
                      <p className="text-[14px] font-medium">{t("regenerateAllWeeks")}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {nonPublished.length === allWeekStarts.length
                          ? t("weeksOverwrite")
                          : (locale === "es"
                            ? `${nonPublished.length} semana(s) — sobreescribirá horarios existentes`
                            : `${nonPublished.length} week(s) — will overwrite existing rotas`)}
                      </p>
                    </button>
                  )}
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowMultiWeekDialog(false)}>
                  {tc("cancel")}
                </Button>
              </div>
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
        onRefreshWeek={() => fetchWeek(weekStart)}
      />

      {/* Rota history panel */}
      <RotaHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        weekStart={weekStart}
        onRestored={() => fetchWeek(weekStart)}
      />

      {/* Week notes — desktop only, min-h ensures space is reserved during load */}
      {view === "week" && (
        <div className="hidden md:block shrink-0 min-h-[36px]" data-week-notes>
          <WeekNotes weekStart={weekStart} initialData={initialNotes} />
        </div>
      )}

      {/* Bottom taskbar — desktop only, hidden for viewers */}
      <div className="hidden md:block shrink-0">
        {canEdit && view === "week" && !weekData && loadingWeek && (
          <div className="shrink-0 h-12 bg-background border-t border-border flex items-center px-4 gap-2">
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
            colorChips={colorChips}
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
        rotaDisplayMode={weekData?.rotaDisplayMode ?? "by_shift"}
        engineConfig={weekData?.engineConfig}
      />

      {/* AI Reasoning modal */}
      <AIReasoningModal
        open={showReasoningModal}
        reasoning={weekData?.aiReasoning ?? aiReasoningRef.current ?? ""}
        onClose={() => setShowReasoningModal(false)}
        variant={reasoningSourceRef.current === "hybrid" ? "hybrid" : "claude"}
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

      {/* Desktop viewer swap dialog */}
      {desktopSwapEnabled && swapAssignment && (
        <SwapRequestDialog
          open={swapDialogOpen}
          onOpenChange={setSwapDialogOpen}
          assignmentId={swapAssignment.id}
          shiftType={swapAssignment.shiftType}
          date={swapAssignment.date}
          dateLabel={formatDate(swapAssignment.date, locale as "es" | "en")}
          locale={locale as "es" | "en"}
        />
      )}

    </main>
  )
}
