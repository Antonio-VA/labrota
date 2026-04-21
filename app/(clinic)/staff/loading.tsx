import { Skeleton } from "@/components/ui/skeleton"

export default function StaffLoading() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* KPIs banner */}
      <div className="-mx-0 px-6 md:px-8 pt-6 md:pt-8 pb-5 bg-muted/40 border-b border-border mb-5">
        <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/60 bg-background px-4 py-3 flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-10" />
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 md:px-8 flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/40 border-b border-border">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-3 w-24" />
            <div className="flex flex-1 gap-6">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          {/* Rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="size-7 rounded-full shrink-0" />
              <Skeleton className="h-4 w-32" />
              <div className="flex flex-1 gap-6 items-center">
                <Skeleton className="h-5 w-20 rounded-full" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="size-6 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
