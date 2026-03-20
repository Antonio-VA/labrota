import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { LabConfigForm } from "@/components/lab-config-form"
import { RulesSection } from "@/components/rules-section"
import type { LabConfig, RotaRule, Staff } from "@/lib/types/database"

export default async function LabConfigPage() {
  const supabase = await createClient()
  const t = await getTranslations("lab")

  const [configRes, rulesRes, staffRes] = await Promise.all([
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("*").order("created_at"),
    supabase.from("staff").select("id, first_name, last_name, role").neq("onboarding_status", "inactive").order("first_name"),
  ])

  const config = configRes.data as LabConfig | null
  const rules  = (rulesRes.data ?? []) as RotaRule[]
  const staff  = (staffRes.data ?? []) as Pick<Staff, "id" | "first_name" | "last_name" | "role">[]

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
            <RulesSection rules={rules} staff={staff} />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
