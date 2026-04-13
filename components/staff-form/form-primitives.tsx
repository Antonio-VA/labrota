"use client"

import { useTranslations } from "next-intl"

export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
      <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {children}
    </div>
  )
}

export function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  const tc = useTranslations("common")
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[14px] font-medium">
        {label}
        {!required && (
          <span className="ml-1 text-[12px] font-normal text-muted-foreground">({tc("optional").toLowerCase()})</span>
        )}
      </label>
      {children}
    </div>
  )
}

export function Select({
  name,
  defaultValue,
  disabled,
  onChange,
  children,
}: {
  name: string
  defaultValue?: string
  disabled?: boolean
  onChange?: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className="h-8 w-full rounded-[8px] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </select>
  )
}
