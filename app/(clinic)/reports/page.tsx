import { requireEditor } from "@/lib/require-editor"
import { MobileGate } from "@/components/mobile-gate"
import { ReportsClient } from "@/components/reports-client"
import { getOrgDisplayMode } from "./actions"

export default async function ReportsPage() {
  await requireEditor()
  const { mode, orgName } = await getOrgDisplayMode()

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
      <MobileGate>
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
          <h1 className="text-[18px] font-medium">Informes</h1>
          <ReportsClient orgDisplayMode={mode} orgName={orgName} />
        </div>
      </MobileGate>
    </div>
  )
}
