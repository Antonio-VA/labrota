import { CardSkeleton, Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <>
      <header className="h-12 shrink-0 flex items-center gap-4 border-b px-6">
        <Skeleton className="h-4 w-24" />
      </header>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </>
  )
}
