import { Skeleton } from "@/components/ui/skeleton"

export default function MobileAccountLoading() {
  return (
    <div className="flex-1 overflow-auto lg:hidden p-6 flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  )
}
