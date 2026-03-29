import { Skeleton } from "@/components/ui/skeleton"

export default function MobileWeekLoading() {
  return (
    <div className="flex-1 overflow-hidden flex flex-col lg:hidden p-4 gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
