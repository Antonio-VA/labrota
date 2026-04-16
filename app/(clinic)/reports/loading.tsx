import { Skeleton } from "@/components/ui/skeleton"

export default function ReportsLoading() {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8" style={{ scrollbarGutter: "stable" }}>
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
        {/* Title */}
        <Skeleton className="h-[18px] w-32" />
        {/* Report content placeholder */}
        <div className="rounded-lg border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
