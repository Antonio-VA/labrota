import { requireEditor } from "@/lib/require-editor"
import { MobileGate } from "@/components/mobile-gate"
import dynamic from "next/dynamic"
const ImportRotaWizard = dynamic(() => import("@/components/import-rota-wizard").then((m) => m.ImportRotaWizard))

export default async function ImportRotaPage() {
  await requireEditor()

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8" style={{ scrollbarGutter: "stable" }}>
      <MobileGate>
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
          <ImportRotaWizard />
        </div>
      </MobileGate>
    </div>
  )
}
