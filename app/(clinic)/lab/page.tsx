import { requireEditor } from "@/lib/require-editor"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { LabConfigForm } from "@/components/lab-config-form"
import { RulesSection } from "@/components/rules-section"
import { ShiftTypesTable } from "@/components/shift-types-table"
import { TécnicasTab } from "@/components/tecnicas-tab"
import { PlantillasTab } from "@/components/plantillas-tab"
import { DepartmentsTab } from "@/components/departments-tab"
import { LabPageTabs } from "@/components/lab-page-tabs"
import type { LabConfig, RotaRule, Staff, ShiftTypeDefinition, Tecnica, RotaTemplate, Department } from "@/lib/types/database"

export default async function LabConfigPage() {
  await requireEditor()
  const supabase = await createClient()
  const t = await getTranslations("lab")

  const [configRes, rulesRes, staffRes, shiftTypesRes, tecnicasRes, templatesRes, departmentsRes] = await Promise.all([
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("*").order("created_at"),
    supabase.from("staff").select("id, first_name, last_name, role").neq("onboarding_status", "inactive").order("first_name"),
    supabase.from("shift_types").select("*").order("sort_order"),
    supabase.from("tecnicas").select("*").order("orden").order("created_at"),
    supabase.from("rota_templates").select("*").order("created_at", { ascending: false }),
    supabase.from("departments").select("*").order("sort_order"),
  ])

  const config     = configRes.data as LabConfig | null
  const rules      = (rulesRes.data ?? []) as RotaRule[]
  const staff      = (staffRes.data ?? []) as Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  const shiftTypes = (shiftTypesRes.data ?? []) as ShiftTypeDefinition[]
  const tecnicas   = (tecnicasRes.data ?? []) as Tecnica[]
  const templates    = (templatesRes.data ?? []) as RotaTemplate[]
  const departments  = (departmentsRes.data ?? []) as Department[]

  return (
    <div className="flex-1 overflow-auto p-6 md:p-8">
      <MobileGate>
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-[18px] font-medium">{t("configuration")}</h1>
          </div>

          <LabPageTabs
            departamentos={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Departamentos
                </p>
                <DepartmentsTab initialDepartments={departments} />
              </div>
            }
            turnos={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  {t("sections.shifts")}
                </p>
                <ShiftTypesTable initialTypes={shiftTypes} />
              </div>
            }
            configuracion={
              config ? (
                <LabConfigForm config={config} shiftTypes={shiftTypes} />
              ) : (
                <p className="text-[14px] text-muted-foreground">
                  Lab configuration not found. Please contact your administrator.
                </p>
              )
            }
            reglas={<RulesSection rules={rules} staff={staff} />}
            tecnicas={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Técnicas
                </p>
                <TécnicasTab initialTecnicas={tecnicas} />
              </div>
            }
            plantillas={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Plantillas
                </p>
                <PlantillasTab initialTemplates={templates} />
              </div>
            }
          />
        </div>
      </MobileGate>
    </div>
  )
}
