import { getTranslations } from "next-intl/server"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { MobileGate } from "@/components/mobile-gate"
import { StaffForm } from "@/components/staff-form"

export default async function NewStaffPage() {
  const t = await getTranslations("staff")

  return (
    <>
      <header className="h-12 shrink-0 flex items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-[14px] font-medium text-muted-foreground">{t("addStaff")}</span>
      </header>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div>
              <h1 className="text-[18px] font-medium">{t("addStaff")}</h1>
            </div>
            <StaffForm mode="create" />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
