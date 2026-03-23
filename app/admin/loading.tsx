import { TableSkeleton, Skeleton } from "@/components/ui/skeleton"

export default function AdminLoading() {
  return (
    <div className="p-8">
      <Skeleton className="h-6 w-48 mb-6" />
      <TableSkeleton rows={6} />
    </div>
  )
}
