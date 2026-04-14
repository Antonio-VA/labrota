"use client"

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { getMondayOfWeek } from "@/lib/rota-engine"

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

export function WeekPicker({ weekStart, locale, onSelect }: { weekStart: string; locale: "es" | "en"; onSelect: (w: string) => void }) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setDropPos({ top: r.bottom + 4, left: r.left })
  }, [open])

  useEffect(() => {
    if (!open) return
    function h(e: Event) {
      if (dropRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", h)
    document.addEventListener("touchstart", h)
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h) }
  }, [open])

  const weeks = useMemo(() => {
    const result: { monday: string; label: string }[] = []
    for (let i = -4; i <= 8; i++) {
      const monday = addDays(weekStart, i * 7)
      const end = addDays(monday, 6)
      const s = new Date(monday + "T12:00:00")
      const e = new Date(end + "T12:00:00")
      const sm = new Intl.DateTimeFormat(locale, { month: "short" }).format(s)
      const em = new Intl.DateTimeFormat(locale, { month: "short" }).format(e)
      const label = sm === em
        ? `${s.getDate()}–${e.getDate()} ${sm}`
        : `${s.getDate()} ${sm} – ${e.getDate()} ${em}`
      result.push({ monday, label })
    }
    return result
  }, [weekStart, locale])

  const curLabel = (() => {
    const s = new Date(weekStart + "T12:00:00")
    const e = new Date(addDays(weekStart, 6) + "T12:00:00")
    const sm = new Intl.DateTimeFormat(locale, { month: "short" }).format(s)
    const em = new Intl.DateTimeFormat(locale, { month: "short" }).format(e)
    return sm === em ? `${s.getDate()}–${e.getDate()} ${sm}` : `${s.getDate()} ${sm} – ${e.getDate()} ${em}`
  })()

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[15px] font-semibold capitalize active:opacity-70 shrink-0"
      >
        {curLabel}
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && dropPos && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] w-52 rounded-xl border border-border bg-background shadow-lg py-1 max-h-[60vh] overflow-y-auto"
          style={{ top: dropPos.top, left: dropPos.left }}
        >
          {weeks.map((w) => {
            const isCurrent = w.monday === weekStart
            const todayMonday = getMondayOfWeek(new Date())
            const isThisWeek = w.monday === todayMonday
            return (
              <button
                key={w.monday}
                onClick={() => { onSelect(w.monday); setOpen(false) }}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-[13px] capitalize hover:bg-accent transition-colors flex items-center justify-between gap-3",
                  isCurrent && "bg-accent/60 font-semibold"
                )}
              >
                <span>{w.label}</span>
                {isThisWeek && <span className="text-[11px] text-primary font-medium">{t("todayLabel")}</span>}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
