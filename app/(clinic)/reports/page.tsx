import dynamic from "next/dynamic"
import { getTranslations } from "next-intl/server"
import { requireEditor } from "@/lib/require-editor"
import { MobileGate } from "@/components/mobile-gate"

const ReportsClient = dynamic(() => import("@/components/reports-client").then((m) => m.ReportsClient))
import { getOrgDisplayMode } from "./actions"

export default async function ReportsPage() {
  await requireEditor()
  const t = await getTranslations("reports")
  const { mode, orgName } = await getOrgDisplayMode()

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
      <MobileGate>
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
          <h1 className="text-[18px] font-medium">{t("title")}</h1>
          <ReportsClient orgDisplayMode={mode} orgName={orgName} />
        </div>
      </MobileGate>
    </div>
  )
}
