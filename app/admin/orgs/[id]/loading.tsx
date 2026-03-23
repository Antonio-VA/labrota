import { TableSkeleton, Skeleton } from "@/components/ui/skeleton"

export default function OrgDetailLoading() {
  return (
    <div className="p-8">
      <Skeleton className="h-6 w-64 mb-6" />
      <TableSkeleton rows={5} />
    </div>
  )
}
