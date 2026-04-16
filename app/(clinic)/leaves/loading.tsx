import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

export default function LeavesLoading() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden p-4 lg:p-6 gap-4">
      {/* Title + button */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-[18px] w-32" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      {/* Balance strip */}
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
        ))}
      </div>
      {/* Leave table */}
      <TableSkeleton rows={6} />
    </div>
  )
}
