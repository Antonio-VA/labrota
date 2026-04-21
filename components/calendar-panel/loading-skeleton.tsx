"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function CalendarSkeleton() {
  return (
    <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="hidden lg:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background">
        <div className="flex items-center gap-2 shrink-0">
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
        {/* Day-header row — 80px label column + 7 day columns, matching ShiftGrid */}
        <div className="grid gap-px mb-1" style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}>
          <div /> {/* top-left corner */}
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center py-2">
              <Skeleton className="h-3 w-8 rounded mb-1" />
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          ))}
        </div>

        {/* Body rows — label cell on left, then 7 day cells */}
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="grid gap-px mb-1.5" style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}>
            <div className="flex items-start pt-2 px-1.5">
              <Skeleton className="h-3.5 w-14 rounded" />
            </div>
            {Array.from({ length: 7 }).map((_, col) => (
              <div key={col} className="flex flex-col gap-1 p-1.5">
                <Skeleton className="h-5 w-full rounded" />
                {row < 3 && <Skeleton className="h-5 w-4/5 rounded" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  )
}
