import type {
  CoverageByDay,
  PunctionsByDay,
} from "@/lib/types/database"

export const DAY_KEYS: (keyof PunctionsByDay)[] = [
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
]

export function isWeekendKey(day: keyof PunctionsByDay): boolean {
  return day === "sat" || day === "sun"
}

export const DEFAULT_PUNCTIONS: PunctionsByDay = {
  mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 2, sun: 0,
}

export const DEFAULT_COVERAGE: CoverageByDay = {
  mon: { lab: 3, andrology: 1, admin: 1 },
  tue: { lab: 3, andrology: 1, admin: 1 },
  wed: { lab: 3, andrology: 1, admin: 1 },
  thu: { lab: 3, andrology: 1, admin: 1 },
  fri: { lab: 3, andrology: 1, admin: 1 },
  sat: { lab: 1, andrology: 0, admin: 0 },
  sun: { lab: 0, andrology: 0, admin: 0 },
}

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-8 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[14px] font-medium">{label}</span>
        {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">
      {title}
    </p>
  )
}

export type FormValues = {
  punctions_by_day: PunctionsByDay
  autonomous_community: string
  ratio_optimal: number
  ratio_minimum: number
  biopsy_conversion_rate: number
  biopsy_day5_pct: number
  biopsy_day6_pct: number
  task_conflict_threshold: number
  days_off_preference: "always_weekend" | "prefer_weekend" | "any_day" | "guardia"
  guardia_min_weeks_between: number
  guardia_max_per_month: number
  public_holiday_mode: "weekday" | "saturday" | "sunday"
  public_holiday_reduce_budget: boolean
  part_time_weight: number
  intern_weight: number
}

export type SetValues = React.Dispatch<React.SetStateAction<FormValues>>
