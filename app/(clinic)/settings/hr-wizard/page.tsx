import { requireEditor } from "@/lib/require-editor"
import { redirect } from "next/navigation"
import { MobileGate } from "@/components/mobile-gate"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import { HrSetupWizard } from "@/components/hr-setup-wizard"
import type { CompanyLeaveType } from "@/lib/types/database"

export default async function HrWizardPage() {
  await requireEditor()
  const t = await getTranslations("hr")
  const orgId = await getOrgId()
  if (!orgId) redirect("/settings")

  const supabase = await createClient()

  // Check if already installed and active
  const { data: hrModule } = await supabase
    .from("hr_module")
    .select("status")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { status: string } | null }

  if (hrModule?.status === "active") {
    redirect("/settings/hr-module")
  }

  // Get existing legacy leave types in use
  const { data: legacyLeaves } = await supabase
    .from("leaves")
    .select("type")
    .eq("organisation_id", orgId)
    .is("leave_type_id", null) as { data: Array<{ type: string }> | null }

  const legacyTypes = [...new Set((legacyLeaves ?? []).map((l) => l.type))]

  // Get any existing company leave types (from previous partial install)
  const { data: existingTypes } = await supabase
    .from("company_leave_types")
    .select("*")
    .eq("organisation_id", orgId)
    .order("sort_order") as { data: CompanyLeaveType[] | null }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8" style={{ scrollbarGutter: "stable" }}>
      <MobileGate>
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
          <h1 className="text-[18px] font-medium">{t("wizardTitle")}</h1>
          <HrSetupWizard
            legacyTypes={legacyTypes}
            existingTypes={existingTypes ?? []}
          />
        </div>
      </MobileGate>
    </div>
  )
}
