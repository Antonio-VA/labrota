"use client"

import { useTranslations, useLocale } from "next-intl"
import { Pencil, Trash2, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDateWithYear } from "@/lib/format-date"
import type { RotaRule, Staff, Tecnica } from "@/lib/types/database"
import { DAY_LABEL_LONG } from "./constants"
import { Toggle } from "./toggle"

export function getRuleDescription(
  rule: RotaRule,
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[],
  tecnicas: Pick<Tecnica, "codigo" | "nombre_es" | "nombre_en" | "activa">[],
  t: (key: string) => string,
): string {
  if (rule.type === "restriccion_dia_tecnica") {
    const code = rule.params.tecnica_code as string | undefined
    const mode = rule.params.dayMode as string | undefined
    const days = (rule.params.restrictedDays as string[] | undefined) ?? []
    const tec = tecnicas.find((tc) => tc.codigo === code)
    const tecName = tec?.nombre_es ?? code ?? "?"
    const dayNames = days.map((d) => DAY_LABEL_LONG[d] ?? d).join(", ")
    if (mode === "only") return `${tecName}: solo ${dayNames}`
    return `${tecName}: nunca ${dayNames}`
  }
  // For staff-based rules, show names
  if (rule.staff_ids.length > 0 && (rule.type === "no_coincidir" || rule.type === "no_librar_mismo_dia" || rule.type === "no_misma_tarea")) {
    const names = rule.staff_ids.map((id) => {
      const s = staff.find((st) => st.id === id)
      return s ? s.first_name : "?"
    }).join(", ")
    const scope = rule.type === "no_coincidir" && rule.params.scope === "same_shift"
      ? ` [${t("params.coincideScopeShift").toLowerCase()}]` : ""
    const days = rule.type === "no_coincidir" && (rule.params.days as string[] | undefined)?.length
      ? ` (${(rule.params.days as string[]).map((d) => DAY_LABEL_LONG[d] ?? d).join(", ")})` : ""
    return `${t(`descriptions.${rule.type}`)} — ${names}${scope}${days}`
  }
  if (rule.type === "supervisor_requerido") {
    const supId = rule.params.supervisor_id as string | undefined
    const sup = staff.find((s) => s.id === supId)
    const supervised = rule.staff_ids
      .filter((id) => id !== supId)
      .map((id) => { const s = staff.find((st) => st.id === id); return s ? s.first_name : "?" })
    const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
    const trainingTecCode = rule.params.training_tecnica_code as string | undefined
    const trainingTec = trainingTecCode ? tecnicas.find((tc) => tc.codigo === trainingTecCode) : null
    if (sup) {
      const supervisedStr = supervised.length > 0 ? ` → ${supervised.join(", ")}` : ""
      const daysStr = supDays.length > 0 ? ` (${supDays.map((d) => DAY_LABEL_LONG[d] ?? d).join(", ")})` : ""
      const tecStr = trainingTec ? ` [${trainingTec.nombre_es}]` : ""
      return `${sup.first_name} ${sup.last_name}${supervisedStr}${daysStr}${tecStr}`
    }
  }
  if (rule.type === "max_dias_consecutivos") {
    const max = rule.params.maxDays as number | undefined
    if (max) return `${t(`descriptions.${rule.type}`)} (${max})`
  }
  if (rule.type === "distribucion_fines_semana") {
    const max = rule.params.maxPerMonth as number | undefined
    if (max) return `${t(`descriptions.${rule.type}`)} (${max}/mes)`
  }
  if (rule.type === "asignacion_fija") {
    const names = rule.staff_ids.map((id) => {
      const s = staff.find((st) => st.id === id)
      return s ? s.first_name : "?"
    }).join(", ")
    const fixedShift = rule.params.fixedShift as string | undefined
    const fixedDays = (rule.params.fixedDays as string[] | undefined) ?? []
    const parts: string[] = [names]
    if (fixedShift) parts.push(`turno ${fixedShift}`)
    if (fixedDays.length > 0) parts.push(fixedDays.map((d) => DAY_LABEL_LONG[d] ?? d).join(", "))
    return parts.join(" → ")
  }
  if (rule.type === "tecnicas_juntas") {
    const codes = (rule.params.tecnica_codes as string[] | undefined) ?? []
    const tecNames = codes.map((c) => tecnicas.find((tc) => tc.codigo === c)?.nombre_es ?? c).join(" + ")
    const days = (rule.params.days as string[] | undefined) ?? []
    const daysStr = days.length > 0 ? ` (${days.map((d) => DAY_LABEL_LONG[d] ?? d).join(", ")})` : ""
    return `${tecNames}${daysStr}`
  }
  if (rule.type === "tarea_multidepartamento") {
    const code = rule.params.tecnica_code as string | undefined
    const tec = tecnicas.find((tc) => tc.codigo === code)
    const tecName = tec?.nombre_es ?? code ?? "?"
    const depts = (rule.params.departments as string[] | undefined) ?? []
    const days = (rule.params.days as string[] | undefined) ?? []
    const daysStr = days.length > 0 ? ` (${days.map((d) => DAY_LABEL_LONG[d] ?? d).join(", ")})` : ""
    return `${tecName}: ${depts.join(" + ")}${daysStr}`
  }
  if (rule.type === "equipo_completo") {
    const codes = (rule.params.tecnica_codes as string[] | undefined) ?? []
    const tecNames = codes.map((c) => tecnicas.find((tc) => tc.codigo === c)?.nombre_es ?? c).join(", ")
    const days = (rule.params.days as string[] | undefined) ?? []
    const daysStr = days.length > 0 ? ` (${days.map((d) => DAY_LABEL_LONG[d] ?? d).join(", ")})` : ""
    return `${tecNames}${daysStr}`
  }
  return t(`descriptions.${rule.type}`)
}

export function RuleCard({
  rule,
  expired = false,
  deletingId,
  onToggle,
  onEdit,
  onDelete,
  staff,
  tecnicas,
}: {
  rule: RotaRule
  expired?: boolean
  deletingId: string | null
  onToggle: (rule: RotaRule) => void
  onEdit: (rule: RotaRule) => void
  onDelete: (id: string) => void
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  tecnicas: Pick<Tecnica, "codigo" | "nombre_es" | "nombre_en" | "activa">[]
}) {
  const t = useTranslations("lab.rules")
  const locale = useLocale() as "es" | "en"

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[8px] border border-border bg-background px-4 py-3",
        expired && "opacity-60"
      )}
    >
      {/* Type + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-medium">{t(`types.${rule.type}`)}</span>
          {rule.type !== "restriccion_dia_tecnica" && (
          <Badge variant={rule.is_hard ? "skill-gap" : "outline"} className="text-[11px]">
            {rule.is_hard ? t("hard") : t("soft")}
          </Badge>
          )}
          {!rule.enabled && (
            <Badge variant="inactive" className="text-[11px]">{t("disabled")}</Badge>
          )}
          {rule.expires_at && !expired && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-2.5" />
              {formatDateWithYear(rule.expires_at, locale)}
            </span>
          )}
          {expired && (
            <Badge variant="inactive" className="text-[10px]">{t("expired")}</Badge>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5">{getRuleDescription(rule, staff, tecnicas, t)}</p>
        {rule.notes && (
          <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{rule.notes}</p>
        )}
      </div>

      {/* Enabled toggle */}
      {!expired && <Toggle checked={rule.enabled} onChange={() => onToggle(rule)} />}

      {/* Edit */}
      <button
        type="button"
        onClick={() => onEdit(rule)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Edit rule"
      >
        <Pencil className="size-3.5" />
      </button>

      {/* Delete with inline confirm */}
      <button
        type="button"
        onClick={() => onDelete(rule.id)}
        className={cn(
          "transition-colors text-[12px] font-medium",
          deletingId === rule.id
            ? "text-destructive"
            : "text-muted-foreground hover:text-destructive"
        )}
        aria-label="Delete rule"
      >
        {deletingId === rule.id ? t("confirmDelete") : <Trash2 className="size-3.5" />}
      </button>
    </div>
  )
}
