"use client"

import { cn } from "@/lib/utils"

const DAY_LABELS_ES = ["L", "M", "X", "J", "V", "S", "D"]
const DAY_LABELS_EN = ["M", "T", "W", "T", "F", "S", "S"]

interface WeekDay {
  date: string
  staffCount: number
  hasSkillGaps: boolean
}

export function WeeklyStrip({
  days,
  currentDate,
  onSelectDay,
  locale = "es",
}: {
  days: WeekDay[]
  currentDate: string
  onSelectDay: (date: string) => void
  locale?: "es" | "en"
}) {
  const labels = locale === "es" ? DAY_LABELS_ES : DAY_LABELS_EN
  const today = new Date().toISOString().split("T")[0]

  return (
    <div className="flex items-center justify-around px-2 py-2 border-b border-border bg-background md:hidden">
      {days.map((day, i) => {
        const isActive = day.date === currentDate
        const isToday = day.date === today
        const dayNum = new Date(day.date + "T12:00:00").getDate()

        // Coverage dot color
        let dotColor = "bg-muted-foreground/20" // no rota / grey
        if (day.staffCount > 0) {
          dotColor = day.hasSkillGaps ? "bg-amber-400" : "bg-emerald-400"
        }

        return (
          <button
            key={day.date}
            onClick={() => onSelectDay(day.date)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition-colors min-w-[36px]",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground active:bg-accent"
            )}
          >
            <span className="text-[10px] font-medium leading-none">{labels[i] ?? ""}</span>
            <span className={cn(
              "text-[15px] font-semibold leading-none",
              isToday && !isActive && "text-primary"
            )}>
              {dayNum}
            </span>
            <span className={cn("size-1.5 rounded-full", isActive ? "bg-primary-foreground/60" : dotColor)} />
          </button>
        )
      })}
    </div>
  )
}
