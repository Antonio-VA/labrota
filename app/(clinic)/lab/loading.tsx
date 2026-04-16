import { Skeleton } from "@/components/ui/skeleton"

export default function LabLoading() {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8" style={{ scrollbarGutter: "stable" }}>
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
        {/* Title + mode badge */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-[18px] w-40" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        {/* Tab bar */}
        <div className="flex border-b border-border gap-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-t" />
          ))}
        </div>
        {/* Tab content placeholder */}
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
