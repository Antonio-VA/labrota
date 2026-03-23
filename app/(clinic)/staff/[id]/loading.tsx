import { Skeleton } from "@/components/ui/skeleton"

export default function EditStaffLoading() {
  return (
    <div className="flex-1 overflow-auto p-6 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32 mt-2" />
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
