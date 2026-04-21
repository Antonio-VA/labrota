import { Skeleton } from "@/components/ui/skeleton"

export default function StaffDetailLoading() {
  return (
    <div className="flex-1 overflow-auto p-6 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* Back arrow + staff name */}
        <div className="flex items-center gap-1">
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-[18px] w-40 rounded" />
        </div>

        {/* Tab strip */}
        <div className="flex gap-0 border-b border-border -mb-2 pb-0">
          {[80, 100, 72, 72].map((w, i) => (
            <div key={i} className="px-4 py-2">
              <Skeleton className={`h-4 w-${w === 80 ? "20" : w === 100 ? "24" : "16"} rounded`} style={{ width: w }} />
            </div>
          ))}
        </div>

        {/* Section: personal info */}
        <div className="flex flex-col gap-4 rounded-lg border border-border p-5">
          <Skeleton className="h-4 w-32 rounded" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>

        {/* Section: role / shift */}
        <div className="flex flex-col gap-4 rounded-lg border border-border p-5">
          <Skeleton className="h-4 w-24 rounded" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
