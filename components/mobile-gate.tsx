import { Monitor } from "lucide-react"

/**
 * Wraps content that should only be accessible on desktop (≥768px).
 * On mobile, renders a "please use a desktop browser" message instead.
 * Use this in Team, Leaves, Lab, Reports, and Settings pages.
 */
export function MobileGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="md:hidden flex items-center justify-center min-h-[60vh] px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Monitor className="size-8 text-muted-foreground" />
          <p className="text-[14px] font-medium">Desktop required</p>
          <p className="text-[14px] text-muted-foreground max-w-[260px]">
            Please use a desktop browser (1280px or wider) for full access to this section.
          </p>
        </div>
      </div>
      <div className="hidden md:block">{children}</div>
    </>
  )
}
