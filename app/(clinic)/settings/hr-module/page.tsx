import { requireEditor } from "@/lib/require-editor"
import { redirect } from "next/navigation"
import { MobileGate } from "@/components/mobile-gate"
import { getTranslations } from "next-intl/server"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { HrModuleSettingsPage } from "@/components/hr-module-settings-page"
import {
  getHrModuleStatus,
  getHolidayConfig,
  getCompanyLeaveTypes,
} from "@/app/(clinic)/settings/hr-module-actions"
import type { CompanyLeaveType, HolidayConfig } from "@/lib/types/database"

export default async function HrModulePage() {
  await requireEditor()
  const t = await getTranslations("hr")

  const hrStatus = await getHrModuleStatus()

  if (!hrStatus.active) {
    redirect("/settings")
  }

  const [config, leaveTypes] = await Promise.all([
    getHolidayConfig(),
    getCompanyLeaveTypes(),
  ])

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8" style={{ scrollbarGutter: "stable" }}>
      <MobileGate>
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-[18px] font-medium flex items-center gap-1">
              <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="size-5" />
              </Link>
              {t("settingsLink")}
            </h1>
          </div>
          <HrModuleSettingsPage
            config={config}
            leaveTypes={leaveTypes}
          />
        </div>
      </MobileGate>
    </div>
  )
}
