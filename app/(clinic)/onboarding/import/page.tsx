import { requireEditor } from "@/lib/require-editor"
import { MobileGate } from "@/components/mobile-gate"
import dynamic from "next/dynamic"
const ImportWizard = dynamic(() => import("@/components/import-wizard").then((m) => m.ImportWizard))

export default async function ImportPage() {
  await requireEditor()

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
      <MobileGate>
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
          <ImportWizard />
        </div>
      </MobileGate>
    </div>
  )
}
