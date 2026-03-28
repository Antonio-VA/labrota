import { Skeleton } from "@/components/ui/skeleton"

export default function ScheduleLoading() {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar skeleton */}
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
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="flex-1 px-4 py-2 overflow-hidden">
        <div className="flex flex-col gap-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center py-2">
                <Skeleton className="h-3 w-8 rounded mb-1" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            ))}
          </div>
          {/* Shift rows */}
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
      </div>
    </main>
  )
}
