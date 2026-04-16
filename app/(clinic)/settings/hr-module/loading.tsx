import { Skeleton } from "@/components/ui/skeleton"

export default function HrModuleLoading() {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8" style={{ scrollbarGutter: "stable" }}>
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
        {/* Back arrow + title */}
        <div className="flex items-center gap-1">
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-[18px] w-48" />
        </div>
        {/* Settings cards */}
        <div className="rounded-lg border border-border p-5 flex flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="rounded-lg border border-border p-5 flex flex-col gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  )
}
