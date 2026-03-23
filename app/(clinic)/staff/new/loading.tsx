import { Skeleton } from "@/components/ui/skeleton"

export default function NewStaffLoading() {
  return (
    <div className="flex-1 overflow-auto p-6 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <Skeleton className="h-6 w-40" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
