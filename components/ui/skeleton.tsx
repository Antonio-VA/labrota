import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

/** Skeleton for a single table row: avatar + two text columns + badge + action */
function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-border last:border-0">
      <Skeleton className="size-8 rounded-full shrink-0" />
      <div className="flex flex-1 gap-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-8" />
    </div>
  )
}

/** Skeleton for a stat/info card */
function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border p-6 flex flex-col gap-3", className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

/** Skeleton for a list of table rows */
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} />
      ))}
    </div>
  )
}

export { Skeleton, TableRowSkeleton, CardSkeleton, TableSkeleton }
