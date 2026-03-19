import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Skeleton, CardSkeleton } from "@/components/ui/skeleton"

export default function LabLoading() {
  return (
    <>
      <header className="h-12 shrink-0 flex items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
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
          <CardSkeleton />
        </div>
      </div>
    </>
  )
}
