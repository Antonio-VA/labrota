import { Skeleton } from "@/components/ui/skeleton"

export default function PrintLoading() {
  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <Skeleton className="h-8 w-48 mb-4" />
      <Skeleton className="h-[400px] w-full rounded-lg" />
    </div>
  )
}
