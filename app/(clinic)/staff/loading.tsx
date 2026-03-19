import { TableSkeleton, Skeleton } from "@/components/ui/skeleton"

export default function StaffLoading() {
  return (
    <>
      <header className="h-12 shrink-0 flex items-center gap-4 border-b px-6">
        <Skeleton className="h-4 w-16" />
      </header>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <TableSkeleton rows={8} />
      </div>
    </>
  )
}
