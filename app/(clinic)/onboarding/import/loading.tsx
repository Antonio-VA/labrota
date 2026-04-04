import { CardSkeleton, Skeleton } from "@/components/ui/skeleton"

export default function ImportLoading() {
  return (
    <div className="flex-1 overflow-auto p-6 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <CardSkeleton />
      </div>
    </div>
  )
}
