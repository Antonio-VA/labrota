"use client"

import { useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet"
import type { RotaRule, RotaRuleType, Staff, Tecnica, ShiftTypeDefinition } from "@/lib/types/database"
import { RULE_TYPES } from "./constants"
import { useRuleForm } from "@/hooks/use-rule-form"
import {
  Field, INPUT_CLASS, HardSoftToggle, StaffPicker, ExpiryToggle,
} from "./rule-sheet-shared"
import { RuleTypeFields } from "./rule-type-fields"

export function RuleSheet({
  open, onOpenChange, editing, staff, tecnicas = [], shiftTypes = [], allowedTypes, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: RotaRule | null
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  tecnicas?: Pick<Tecnica, "codigo" | "nombre_es" | "nombre_en" | "activa">[]
  shiftTypes?: Pick<ShiftTypeDefinition, "code" | "name_es" | "name_en">[]
  allowedTypes: Set<RotaRuleType>
  onSaved: (rule: RotaRule) => void
}) {
  const t = useTranslations("lab.rules")
  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  const { form, set, toggleInList, isPending, error, setError, requiresStaffPair, showStaffPicker, submit } =
    useRuleForm({ open, editing, onSaved, onClose: close })

  const handleOpenChange = useCallback((v: boolean) => {
    setError("")
    onOpenChange(v)
  }, [onOpenChange, setError])

  const activeTecnicas = useMemo(() => tecnicas.filter((tc) => tc.activa), [tecnicas])
  const visibleTypes = useMemo(() => RULE_TYPES.filter((rt) => allowedTypes.has(rt)), [allowedTypes])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>{editing ? t("save") : t("add")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <Field label="Tipo" hint={t(`descriptions.${form.type}`)}>
            <select
              className={INPUT_CLASS}
              value={form.type}
              onChange={(e) => set("type", e.target.value as RotaRuleType)}
            >
              {visibleTypes.map((rt) => (
                <option key={rt} value={rt}>{t(`types.${rt}`)}</option>
              ))}
            </select>
          </Field>

          {form.type !== "restriccion_dia_tecnica" && (
            <HardSoftToggle isHard={form.is_hard} onChange={(v) => set("is_hard", v)} />
          )}

          <RuleTypeFields
            form={form}
            set={set}
            toggleInList={toggleInList}
            staff={staff}
            tecnicas={activeTecnicas}
            shiftTypes={shiftTypes}
          />

          {showStaffPicker && (
            <StaffPicker
              staff={staff}
              selected={form.staff_ids}
              requiresPair={requiresStaffPair}
              onToggle={(id) => toggleInList("staff_ids", id)}
              onSelectAll={() => set("staff_ids", [])}
            />
          )}

          <ExpiryToggle value={form.expires_at} onChange={(v) => set("expires_at", v)} />

          <Field label={t("adminNotes")}>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Internal note…"
              className={cn(INPUT_CLASS, "resize-none")}
            />
          </Field>

          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        <SheetFooter className="border-t border-border px-5 py-4 flex-row gap-2">
          <Button variant="ghost" className="flex-1" onClick={close} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button className="flex-1" onClick={submit} disabled={isPending}>
            {isPending ? "…" : t("save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
