import { Skeleton } from "@/components/ui/skeleton"

export default function MyRotaLoading() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden p-4 lg:p-6 gap-3">
      {/* Week nav header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <div className="flex gap-1">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
      </div>
      {/* Day cards */}
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  )
}
