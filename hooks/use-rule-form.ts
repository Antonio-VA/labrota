"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { createRule, updateRule } from "@/app/(clinic)/lab/rules-actions"
import type { RotaRule } from "@/lib/types/database"
import {
  defaultForm, ruleToForm, formToInsert, PAIR_TYPES, TECHNIQUE_ONLY_TYPES, type RuleFormState,
} from "@/components/rules-section/constants"

export function useRuleForm({
  open, editing, onSaved, onClose,
}: {
  open: boolean
  editing: RotaRule | null
  onSaved: (rule: RotaRule) => void
  onClose: () => void
}) {
  const t = useTranslations("lab.rules")
  const [form, setForm] = useState<RuleFormState>(editing ? ruleToForm(editing) : defaultForm())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setForm(editing ? ruleToForm(editing) : defaultForm())
      setError("")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = useCallback(<K extends keyof RuleFormState>(key: K, val: RuleFormState[K]) => {
    setForm((p) => ({ ...p, [key]: val }))
  }, [])

  const toggleInList = useCallback(<K extends keyof RuleFormState>(key: K, item: string) => {
    setForm((p) => {
      const list = p[key] as string[]
      const next = list.includes(item) ? list.filter((v) => v !== item) : [...list, item]
      return { ...p, [key]: next as RuleFormState[K] }
    })
  }, [])

  const requiresStaffPair = PAIR_TYPES.has(form.type)
  const showStaffPicker = !TECHNIQUE_ONLY_TYPES.has(form.type)

  const submit = useCallback(() => {
    if (requiresStaffPair && form.staff_ids.length < 2) {
      setError(t("errorMinTwoStaff"))
      return
    }
    if (form.type === "restriccion_dia_tecnica") {
      if (!form.tecnica_code) { setError(t("errorSelectTechnique")); return }
      if (form.restrictedDays.length === 0) { setError(t("errorSelectDay")); return }
    }
    startTransition(async () => {
      const data = formToInsert(form)
      const result = editing ? await updateRule(editing.id, data) : await createRule(data)
      if (result.error) {
        setError(result.error)
        toast.error(result.error)
      } else {
        toast.success(editing ? t("updated") : t("created"))
        onClose()
        if (result.rule) onSaved(result.rule)
      }
    })
  }, [form, editing, requiresStaffPair, t, onClose, onSaved])

  return { form, set, toggleInList, isPending, error, setError, requiresStaffPair, showStaffPicker, submit }
}

export type RuleFormApi = ReturnType<typeof useRuleForm>
