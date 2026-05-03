"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { createStaff, updateStaff, deleteStaff } from "@/app/(clinic)/staff/actions"
import type { StaffWithSkills, Tecnica, Department, ShiftTypeDefinition } from "@/lib/types/database"
import { useStaffFormState } from "@/hooks/use-staff-form-state"
import { Section } from "./form-primitives"
import { AutosaveNotes } from "./autosave-notes"
import { TabDatos } from "./tab-datos"
import { TabAvailability } from "./tab-availability"
import { TabTasks } from "./tab-tasks"
import { TabStrip } from "./tab-strip"
import { FormFooter } from "./form-footer"

type Step = "datos" | "disponibilidad" | "tareas" | "balances" | "notes"

export function StaffForm({
  mode, staff, tecnicas, departments: deptsProp, shiftTypes = [],
  defaultDaysPerWeek = 5, guardiaMode = false, hasViewerAccount = false, balancesTab,
}: {
  mode: "create" | "edit"
  staff?: StaffWithSkills
  tecnicas?: Tecnica[]
  departments?: Department[]
  shiftTypes?: ShiftTypeDefinition[]
  defaultDaysPerWeek?: number
  guardiaMode?: boolean
  hasViewerAccount?: boolean
  balancesTab?: React.ReactNode
}) {
  const t = useTranslations("staff")
  const tc = useTranslations("common")
  const thr = useTranslations("hr")
  const action = mode === "edit" ? updateStaff.bind(null, staff!.id) : createStaff
  const [state, formAction, isPending] = useActionState(action, null)

  const form = useStaffFormState({ staff, tecnicas })

  const STEPS: Step[] = balancesTab
    ? ["datos", "disponibilidad", "tareas", "balances", "notes"]
    : mode === "create"
    ? ["datos", "disponibilidad", "tareas"]
    : ["datos", "disponibilidad", "tareas", "notes"]
  const [tab, setTab] = useState<Step>("datos")
  const [stepError, setStepError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { setStepError(null) }, [tab])
  const isWizard = mode === "create"
  const stepLabels: Record<Step, string> = {
    datos: t("wizardStep1"),
    disponibilidad: t("wizardStep2"),
    tareas: t("wizardStep3"),
    balances: thr("balances"),
    notes: tc("notes"),
  }
  const showFooter = tab !== "balances" && tab !== "notes"

  const handleNext = () => {
    setStepError(null)
    if (tab === "datos") {
      const el = formRef.current
      const firstName = (el?.elements.namedItem("first_name") as HTMLInputElement | null)?.value?.trim()
      const startDate = (el?.elements.namedItem("start_date") as HTMLInputElement | null)?.value?.trim()
      if (!firstName) { setStepError(t("errors.firstNameRequired")); return }
      if (!startDate) { setStepError(t("errors.startDateRequired")); return }
    }
    const stepIndex = STEPS.indexOf(tab)
    setTab(STEPS[stepIndex + 1])
  }

  const handleDelete = () => {
    form.startDelete(async () => { await deleteStaff(staff!.id) })
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-6">
      <TabStrip steps={STEPS} labels={stepLabels} current={tab} setCurrent={setTab} isWizard={isWizard} />

      <div className={cn("flex flex-col gap-6", tab !== "datos" && "hidden")}>
        <TabDatos
          form={form} staff={staff} isPending={isPending}
          hasViewerAccount={hasViewerAccount} deptsProp={deptsProp}
        />
      </div>

      <div className={cn("flex flex-col gap-6", tab !== "disponibilidad" && "hidden")}>
        <TabAvailability
          form={form} staff={staff} isPending={isPending}
          defaultDaysPerWeek={defaultDaysPerWeek} shiftTypes={shiftTypes} guardiaMode={guardiaMode}
        />
      </div>

      <div className={cn("flex flex-col gap-6", tab !== "tareas" && "hidden")}>
        <TabTasks form={form} isPending={isPending} />
      </div>

      {balancesTab && (
        <div className={cn("flex flex-col gap-6", tab !== "balances" && "hidden")}>
          {balancesTab}
        </div>
      )}

      <div className={cn("flex flex-col gap-6", tab !== "notes" && "hidden")}>
        {mode === "edit" && staff ? (
          <AutosaveNotes staffId={staff.id} initialValue={staff.notes ?? ""} />
        ) : (
          <Section label={tc("notes")}>
            <textarea
              name="notes"
              defaultValue=""
              disabled={isPending}
              rows={5}
              className="w-full rounded-[8px] border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
              placeholder={tc("optional")}
            />
          </Section>
        )}
      </div>

      {(stepError || state?.error) && (
        <p className="text-[14px] text-destructive">{stepError ?? state?.error}</p>
      )}

      {showFooter && (
        <FormFooter
          steps={STEPS} current={tab} setCurrent={setTab} isWizard={isWizard} isPending={isPending}
          confirmDelete={form.confirmDelete} setConfirmDelete={form.setConfirmDelete}
          isDeleting={form.isDeleting} onDelete={handleDelete}
          onNext={isWizard ? handleNext : undefined}
        />
      )}
    </form>
  )
}
