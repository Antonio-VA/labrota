"use client"

import { useEffect, useRef, useState } from "react"
import { Filter, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

export function DepartmentFilterDropdown({ selected, allDepts, onToggle, onSetAll, onSetOnly, deptLabels, deptColors, deptAbbr }: {
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
