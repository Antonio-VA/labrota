import { CardSkeleton, Skeleton } from "@/components/ui/skeleton"

export default function ReportsLoading() {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  )
}
