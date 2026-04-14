import { TableSkeleton } from "@/components/ui/skeleton"

export default function MobileAccountLoading() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden p-4 lg:p-6 gap-4">
      <div className="flex items-center justify-between">
        <div className="h-[18px] w-32 bg-muted animate-pulse rounded" />
        <div className="h-8 w-28 bg-muted animate-pulse rounded-lg" />
      </div>
      <TableSkeleton rows={8} />
    </div>
  )
}
