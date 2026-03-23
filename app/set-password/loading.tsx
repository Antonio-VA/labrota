import { Skeleton } from "@/components/ui/skeleton"

export default function SetPasswordLoading() {
  return (
    <div className="min-h-screen bg-muted flex items-start justify-center pt-[20vh] px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col gap-6">
        <Skeleton className="h-8 w-24 mx-auto" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  )
}
