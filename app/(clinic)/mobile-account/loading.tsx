import { Skeleton } from "@/components/ui/skeleton"

export default function MobileAccountLoading() {
  return (
    <div className="flex-1 overflow-auto lg:hidden p-4 flex flex-col gap-5">
      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      {/* Settings sections */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
      {/* Sign out */}
      <Skeleton className="h-10 w-full rounded-lg mt-4" />
    </div>
  )
}
