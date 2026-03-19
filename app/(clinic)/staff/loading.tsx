import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

export default function StaffLoading() {
  return (
    <>
      <header className="h-12 shrink-0 flex items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <Skeleton className="h-4 w-20" />
      </header>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <TableSkeleton rows={8} />
      </div>
    </>
  )
}
