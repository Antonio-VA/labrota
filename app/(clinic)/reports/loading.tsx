import { CardSkeleton } from "@/components/ui/skeleton"

export default function ReportsLoading() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden p-4 lg:p-6 gap-4">
      <div className="h-[18px] w-32 bg-muted animate-pulse rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  )
}
