"use client"

import { useTranslations } from "next-intl"
import { ShieldAlert, ShieldCheck, Clock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Staff, Tecnica } from "@/lib/types/database"

const LABEL_CLASS = "block text-[13px] font-medium text-foreground mb-1"
export const INPUT_CLASS =
  "w-full border border-border rounded-[8px] px-3 py-1.5 text-[14px] bg-background focus:outline-none focus:ring-2 focus:ring-primary"

export function Field({
  label, optional, hint, children,
}: {
  label: string
  optional?: boolean
  hint?: string
  children: React.ReactNode
}) {
  const tc = useTranslations("common")
  return (
    <div>
      <label className={LABEL_CLASS}>
        {label}
        {optional && <span className="text-muted-foreground font-normal"> ({tc("optional").toLowerCase()})</span>}
      </label>
      {children}
      {hint && <p className="text-[12px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

export function HardSoftToggle({ isHard, onChange }: { isHard: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations("lab.rules")
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-colors",
          isHard
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-background text-muted-foreground hover:bg-muted"
        )}
      >
        <ShieldAlert className="size-3.5" />
        {t("hard")}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-colors",
          !isHard
            ? "border-amber-500 bg-amber-50 text-amber-700"
            : "border-border bg-background text-muted-foreground hover:bg-muted"
        )}
      >
        <ShieldCheck className="size-3.5" />
        {t("soft")}
      </button>
    </div>
  )
}

export type TecnicaOption = Pick<Tecnica, "codigo" | "nombre_es">

export function TecnicaSelect({
  tecnicas, value, onChange, placeholder,
}: {
  tecnicas: TecnicaOption[]
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <select className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {tecnicas.map((tc) => (
        <option key={tc.codigo} value={tc.codigo}>{tc.nombre_es} ({tc.codigo})</option>
      ))}
    </select>
  )
}

export function TecnicaCheckboxList({
  tecnicas, selected, onToggle,
}: {
  tecnicas: TecnicaOption[]
  selected: string[]
  onToggle: (code: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 border border-border rounded-[8px] p-2 max-h-[200px] overflow-y-auto">
      {tecnicas.map((tc) => (
        <label key={tc.codigo} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px]">
          <input
            type="checkbox"
            checked={selected.includes(tc.codigo)}
            onChange={() => onToggle(tc.codigo)}
          />
          {tc.nombre_es} ({tc.codigo})
        </label>
      ))}
    </div>
  )
}

export function StaffPicker({
  staff, selected, requiresPair, onToggle, onSelectAll,
}: {
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  selected: string[]
  requiresPair: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
}) {
  const t = useTranslations("lab.rules")
  return (
    <div>
      <label className={LABEL_CLASS}>{t("affectedStaff")}</label>
      {requiresPair && (
        <p className="text-[11px] text-muted-foreground mb-1">{t("selectAtLeastTwo")}</p>
      )}
      <div className="flex flex-col gap-1 border border-border rounded-[8px] p-2">
        {!requiresPair && (
          <label className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px] border-b border-border pb-2 mb-1">
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={onSelectAll}
              className="rounded border-border accent-primary"
            />
            <span className="font-medium">{t("allStaff")}</span>
          </label>
        )}
        <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
          {staff.map((s) => (
            <label key={s.id} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px]">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => onToggle(s.id)}
                className="rounded border-border accent-primary"
              />
              {s.first_name} {s.last_name}
              <span className="ml-auto text-[11px] text-muted-foreground">{s.role}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ExpiryToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("lab.rules")
  if (value) {
    return (
      <Field label={t("expiresAt")}>
        <div className="flex items-center gap-2">
          <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-48" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("clearExpiry")}
          </button>
        </div>
      </Field>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        const d = new Date()
        d.setDate(d.getDate() + 30)
        onChange(d.toISOString().split("T")[0])
      }}
      className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
    >
      <Clock className="size-3" />
      {t("addExpiry")}
    </button>
  )
}
