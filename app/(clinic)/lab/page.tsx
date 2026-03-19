import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { LabConfigForm } from "@/components/lab-config-form"
import type { LabConfig } from "@/lib/types/database"

export default async function LabConfigPage() {
  const supabase = await createClient()
  const t = await getTranslations("lab")

  const { data } = await supabase
    .from("lab_config")
    .select("*")
    .single()

  const config = data as LabConfig | null

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div>
              <h1 className="text-[18px] font-medium">{t("configuration")}</h1>
              <p className="text-[14px] text-muted-foreground mt-1">
                {t("sections.coverage")} · {t("sections.staffing")} · {t("sections.shifts")}
              </p>
            </div>
            {config ? (
              <LabConfigForm config={config} />
            ) : (
              <p className="text-[14px] text-muted-foreground">
                Lab configuration not found. Please contact your administrator.
              </p>
            )}
          </div>
        </MobileGate>
      </div>
    </>
  )
}
