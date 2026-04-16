import { Skeleton } from "@/components/ui/skeleton"

export default function HrWizardLoading() {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8" style={{ scrollbarGutter: "stable" }}>
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
        {/* Title */}
        <Skeleton className="h-[18px] w-56" />
        {/* Wizard step indicators */}
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-2 flex-1 rounded-full" />
          ))}
        </div>
        {/* Wizard content */}
        <div className="rounded-lg border border-border p-6 flex flex-col gap-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <div className="flex justify-end gap-2 pt-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
