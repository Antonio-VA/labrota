"use client"

import { Plane, Cross, User, GraduationCap, Baby, CalendarX } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LeaveType, LeaveWithStaff } from "@/lib/types/database"
import type { useTranslations } from "next-intl"

// ── Helpers ──────────────────────────────────────────────────────────────────

export function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T12:00:00")
  const e = new Date(end + "T12:00:00")
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

export const TODAY = new Date().toISOString().split("T")[0]

// ── Leave type config (icon + color) ─────────────────────────────────────────

export const LEAVE_TYPE_CONFIG: Record<LeaveType, {
  icon: React.ElementType
  color: string
  bg: string
  border: string
}> = {
  annual:    { icon: Plane,          color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-50 dark:bg-sky-950/40",       border: "border-sky-200 dark:border-sky-800" },
  sick:      { icon: Cross,         color: "text-rose-600 dark:text-rose-400",     bg: "bg-rose-50 dark:bg-rose-950/40",     border: "border-rose-200 dark:border-rose-800" },
  personal:  { icon: User,          color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40", border: "border-violet-200 dark:border-violet-800" },
  training:  { icon: GraduationCap, color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-950/40",   border: "border-amber-200 dark:border-amber-800" },
  maternity: { icon: Baby,          color: "text-pink-600 dark:text-pink-400",     bg: "bg-pink-50 dark:bg-pink-950/40",     border: "border-pink-200 dark:border-pink-800" },
  other:     { icon: CalendarX,     color: "text-slate-600 dark:text-slate-400",   bg: "bg-slate-50 dark:bg-slate-950/40",   border: "border-slate-200 dark:border-slate-800" },
}

export const ALL_LEAVE_TYPES: LeaveType[] = ["annual", "sick", "personal", "training", "maternity", "other"]

// ── Shared badges ────────────────────────────────────────────────────────────

export function LeaveTypeBadge({ type, label }: { type: LeaveType; label: string }) {
  const cfg = LEAVE_TYPE_CONFIG[type] ?? LEAVE_TYPE_CONFIG.other
  const Icon = cfg.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium", cfg.bg, cfg.border, cfg.color)}>
      <Icon className="size-3" />
      {label}
    </span>
  )
}

export function StatusBadge({ leave, t }: { leave: LeaveWithStaff; t: ReturnType<typeof useTranslations<"leaves">> }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    pending:   { bg: "bg-amber-500/10 border-amber-500/30",   text: "text-amber-700 dark:text-amber-400" },
    approved:  { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-700 dark:text-emerald-400" },
    rejected:  { bg: "bg-rose-500/10 border-rose-500/30",     text: "text-rose-700 dark:text-rose-400" },
    cancelled: { bg: "bg-slate-500/10 border-slate-500/30",   text: "text-slate-600 dark:text-slate-400" },
  }
  const c = cfg[leave.status] ?? cfg.pending

  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium w-fit", c.bg, c.text)}>
      {t(`status.${leave.status}`)}
    </span>
  )
}
