import { Skeleton } from "@/components/ui/skeleton"

export default function NewOrgLoading() {
  return (
    <div className="p-8 max-w-lg">
      <Skeleton className="h-6 w-40 mb-6" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  )
}
