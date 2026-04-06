import { requireEditor } from "@/lib/require-editor"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { MobileGate } from "@/components/mobile-gate"
import { LabConfigForm } from "@/components/lab-config-form"
import { RulesSection } from "@/components/rules-section"
// BiopsiaConfig merged into LabConfigForm parametros section
import { TurnosTab } from "@/components/turnos-tab"
import { TécnicasTab } from "@/components/tecnicas-tab"
import { PlantillasTab } from "@/components/plantillas-tab"
import { DepartmentsTab } from "@/components/departments-tab"
import { LabPageTabs } from "@/components/lab-page-tabs"
import { NotesConfig } from "@/components/notes-config"
import { getNoteTemplates } from "@/app/(clinic)/notes-actions"
import type { LabConfig, RotaRule, Staff, ShiftTypeDefinition, Tecnica, RotaTemplate, Department } from "@/lib/types/database"

export default async function LabConfigPage() {
  await requireEditor()
  const supabase = await createClient()
  const t = await getTranslations("lab")

  const [configRes, rulesRes, staffRes, shiftTypesRes, tecnicasRes, templatesRes, departmentsRes, noteTemplates, rotaDisplayMode] = await Promise.all([
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("*").order("created_at"),
    supabase.from("staff").select("id, first_name, last_name, role, contract_type").neq("onboarding_status", "inactive").order("first_name"),
    supabase.from("shift_types").select("*").order("sort_order"),
    supabase.from("tecnicas").select("*").order("orden").order("created_at"),
    supabase.from("rota_templates").select("*").order("created_at", { ascending: false }),
    supabase.from("departments").select("*").order("sort_order"),
    getNoteTemplates(),
    // Fetch org display mode — single query via RLS (org scoped)
    supabase.from("organisations").select("rota_display_mode").limit(1).maybeSingle()
      .then(({ data }) => (data as { rota_display_mode?: string } | null)?.rota_display_mode ?? "by_shift"),
  ])
  const config     = configRes.data as LabConfig | null
  const rules      = (rulesRes.data ?? []) as RotaRule[]
  const staff      = (staffRes.data ?? []) as (Pick<Staff, "id" | "first_name" | "last_name" | "role"> & { contract_type?: string })[]
  const hasPartTime = staff.some((s) => s.contract_type === "part_time")
  const hasIntern   = staff.some((s) => s.contract_type === "intern")
  const shiftTypes = (shiftTypesRes.data ?? []) as ShiftTypeDefinition[]
  const tecnicas   = (tecnicasRes.data ?? []) as Tecnica[]
  const templates    = (templatesRes.data ?? []) as RotaTemplate[]
  const departments  = (departmentsRes.data ?? []) as Department[]

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
      <MobileGate>
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[18px] font-medium">{t("configuration")}</h1>
            <span className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border",
              rotaDisplayMode === "by_task"
                ? "bg-purple-50 border-purple-200 text-purple-700"
                : "bg-blue-50 border-blue-200 text-blue-700"
            )}>
              {rotaDisplayMode === "by_task" ? t("modeByTask") : t("modeByShift")}
            </span>
          </div>

          <LabPageTabs
            cobertura={
              config ? (
                <LabConfigForm config={config} section="cobertura" rotaDisplayMode={rotaDisplayMode} tecnicas={tecnicas} departments={departments} shiftTypes={shiftTypes} hasPartTime={hasPartTime} hasIntern={hasIntern} />
              ) : (
                <p className="text-[14px] text-muted-foreground">
                  Lab configuration not found. Please contact your administrator.
                </p>
              )
            }
            carga={
              config ? (
                <LabConfigForm config={config} section="workload" rotaDisplayMode={rotaDisplayMode} />
              ) : (
                <p className="text-[14px] text-muted-foreground">Lab configuration not found.</p>
              )
            }
            reglas={<RulesSection rules={rules} staff={staff} tecnicas={tecnicas} shiftTypes={shiftTypes} rotaDisplayMode={rotaDisplayMode} />}
            generador={
              config ? (
                <LabConfigForm config={config} section="parametros" rotaDisplayMode={rotaDisplayMode} initialRotation={(config as { shift_rotation?: string } | null)?.shift_rotation ?? "stable"} />
              ) : (
                <p className="text-[14px] text-muted-foreground">Lab configuration not found.</p>
              )
            }
            plantillas={
              <div className="flex flex-col gap-6">
                <div className="rounded-lg border border-border bg-background px-5 py-4">
                  <NotesConfig
                    initialTemplates={noteTemplates}
                    initialEnabled={config?.enable_notes ?? true}
                  />
                </div>
                <div className="rounded-lg border border-border bg-background px-5 py-4">
                  <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                    Plantillas
                  </p>
                  <PlantillasTab initialTemplates={templates} />
                </div>
              </div>
            }
            tecnicas={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Tareas
                </p>
                <TécnicasTab initialTecnicas={tecnicas} shiftCodes={shiftTypes.filter((s) => s.active !== false).map((s) => s.code)} departments={departments} rotaDisplayMode={rotaDisplayMode} />
              </div>
            }
            departamentos={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Departamentos
                </p>
                <DepartmentsTab initialDepartments={departments} enableSubDepartments={rotaDisplayMode === "by_task" || (config as { enable_task_in_shift?: boolean } | null)?.enable_task_in_shift === true} />
              </div>
            }
            turnos={
              <TurnosTab
                initialTypes={shiftTypes}
                rotaDisplayMode={rotaDisplayMode}
              />
            }
          />
        </div>
      </MobileGate>
    </div>
  )
}
