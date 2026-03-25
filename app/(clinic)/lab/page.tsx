import { requireEditor } from "@/lib/require-editor"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { LabConfigForm } from "@/components/lab-config-form"
import { RulesSection } from "@/components/rules-section"
import { TurnosTab } from "@/components/turnos-tab"
import { AuditLogViewer } from "@/components/audit-log-viewer"
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

  const [configRes, rulesRes, staffRes, shiftTypesRes, tecnicasRes, templatesRes, departmentsRes] = await Promise.all([
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("*").order("created_at"),
    supabase.from("staff").select("id, first_name, last_name, role").neq("onboarding_status", "inactive").order("first_name"),
    supabase.from("shift_types").select("*").order("sort_order"),
    supabase.from("tecnicas").select("*").order("orden").order("created_at"),
    supabase.from("rota_templates").select("*").order("created_at", { ascending: false }),
    supabase.from("departments").select("*").order("sort_order"),
  ])

  // Fetch org display mode
  const { data: { user } } = await supabase.auth.getUser()
  let rotaDisplayMode = "by_shift"
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("organisation_id").eq("id", user.id).single() as { data: { organisation_id: string | null } | null }
    if (profile?.organisation_id) {
      const { data: org } = await supabase.from("organisations").select("rota_display_mode").eq("id", profile.organisation_id).single() as { data: { rota_display_mode?: string } | null }
      rotaDisplayMode = org?.rota_display_mode ?? "by_shift"
    }
  }

  const noteTemplates = await getNoteTemplates()
  const config     = configRes.data as LabConfig | null
  const rules      = (rulesRes.data ?? []) as RotaRule[]
  const staff      = (staffRes.data ?? []) as Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  const shiftTypes = (shiftTypesRes.data ?? []) as ShiftTypeDefinition[]
  const tecnicas   = (tecnicasRes.data ?? []) as Tecnica[]
  const templates    = (templatesRes.data ?? []) as RotaTemplate[]
  const departments  = (departmentsRes.data ?? []) as Department[]

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
      <MobileGate>
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-[18px] font-medium">{t("configuration")}</h1>
          </div>

          <LabPageTabs
            cobertura={
              config ? (
                <LabConfigForm config={config} section="cobertura" rotaDisplayMode={rotaDisplayMode} />
              ) : (
                <p className="text-[14px] text-muted-foreground">
                  Lab configuration not found. Please contact your administrator.
                </p>
              )
            }
            reglas={<RulesSection rules={rules} staff={staff} />}
            plantillas={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Plantillas
                </p>
                <PlantillasTab initialTemplates={templates} />
              </div>
            }
            tecnicas={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Tareas
                </p>
                <TécnicasTab initialTecnicas={tecnicas} shiftCodes={shiftTypes.filter((s) => s.active !== false).map((s) => s.code)} departments={departments} />
              </div>
            }
            departamentos={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Departamentos
                </p>
                <DepartmentsTab initialDepartments={departments} />
              </div>
            }
            turnos={
              <TurnosTab
                initialTypes={shiftTypes}
                initialRotation={(config as { shift_rotation?: string } | null)?.shift_rotation ?? "stable"}
                rotaDisplayMode={rotaDisplayMode}
              />
            }
            notas={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <NotesConfig
                  initialTemplates={noteTemplates}
                  initialEnabled={config?.enable_notes ?? true}
                />
              </div>
            }
            historial={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
                  Historial de cambios
                </p>
                <AuditLogViewer />
              </div>
            }
          />
        </div>
      </MobileGate>
    </div>
  )
}
