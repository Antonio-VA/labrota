import { CardSkeleton } from "@/components/ui/skeleton"

export default function LabLoading() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden p-4 lg:p-6 gap-4">
      <div className="h-[18px] w-40 bg-muted animate-pulse rounded" />
      <CardSkeleton />
    </div>
  )
}
