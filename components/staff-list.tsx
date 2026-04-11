"use client"

import React, { useState, useRef, useEffect, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Users, Pencil, Plus, X, ChevronDown, ChevronRight, Trash2, Hourglass, Star, Columns3, Save, Check, RefreshCw, Info, GripVertical } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills, StaffRole, OnboardingStatus, SkillName, SkillLevel, Tecnica } from "@/lib/types/database"
import {
  bulkAddSkills,
  bulkRemoveSkills,
  bulkUpdateStatus,
  bulkSoftDeleteStaff,
  hardDeleteStaff,
  bulkUpdateStaffField,
  calculateOptimalHeadcount,
  type HeadcountResult,
} from "@/app/(clinic)/staff/actions"
import { useLocale } from "next-intl"

// ── Inline color picker for edit mode ─────────────────────────────────────────

const STAFF_COLORS = [
  "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
  "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  "#E9D5FF", "#FEF08A", "#CCFBF1", "#FFE4E6",
  "#93C5FD", "#86EFAC", "#FCA5A5", "#FCD34D", "#C4B5FD", "#F9A8D4",
  "#6EE7B7", "#FDBA74", "#A5B4FC", "#FDA4AF", "#7DD3FC", "#BEF264",
  "#D8B4FE", "#FDE047", "#99F6E4", "#E0E7FF",
  "#E2E8F0", "#CBD5E1", "#D1D5DB", "#B0B8C4",
  "#E8D5C4", "#D4B896", "#C9B8A8", "#DEC9B0",
]

function StaffColorDot({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(!open)} className="size-3.5 rounded-full ring-1 ring-border hover:ring-primary cursor-pointer" style={{ backgroundColor: color }} />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-1.5 w-[160px]">
          <div className="grid grid-cols-8 gap-0.5">
            {STAFF_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false) }}
                className={cn("size-3.5 rounded-full hover:scale-125 transition-transform", c === color && "ring-2 ring-primary ring-offset-1")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Legacy skill names → Spanish display names (fallback for old data)
const LEGACY_SKILL_NAMES: Record<string, string> = {
  biopsy: "Biopsia", icsi: "ICSI", egg_collection: "Recogida de óvulos",
  embryo_transfer: "Transferencia embrionaria", denudation: "Denudación",
  semen_analysis: "Análisis seminal", sperm_prep: "Preparación espermática",
  sperm_freezing: "Congelación de esperma",
}

function makeSkillLabel(tecnicas: Tecnica[]) {
  const codeMap = Object.fromEntries(tecnicas.map((t) => [t.codigo, t.nombre_es]))
  return (code: string) => codeMap[code] ?? LEGACY_SKILL_NAMES[code] ?? code
}


function sortByName(a: StaffWithSkills, b: StaffWithSkills) {
  return a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
}
function sortByRole(a: StaffWithSkills, b: StaffWithSkills) {
  const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
  return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import { DEFAULT_DEPT_BORDER } from "@/lib/department-colors"
const ROLE_BORDER_COLOR = DEFAULT_DEPT_BORDER


// ── Dropdown wrapper ───────────────────────────────────────────────────────────

function DropdownPanel({
  open, onClose, children, className,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 bottom-full mb-2 rounded-xl border border-border bg-background shadow-lg p-3 min-w-[220px]",
        className
      )}
    >
      {children}
    </div>
  )
}

// ── Add skill dropdown ─────────────────────────────────────────────────────────

function AddSkillDropdown({
  open, onClose, onConfirm, isPending, skills, skillLabel,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (selections: { skill: SkillName; level: SkillLevel }[]) => void
  isPending: boolean
  skills: string[]
  skillLabel: (code: string) => string
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [level, setLevel] = useState<SkillLevel>("certified")

  useEffect(() => {
    if (!open) { setSelected(new Set()); setLevel("certified") }
  }, [open])

  function toggleSkill(s: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  return (
    <DropdownPanel open={open} onClose={onClose} className="w-[240px]">
      <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("dropdowns.addSkillTitle")}</p>
      <div className="flex flex-col gap-1 mb-3 max-h-[200px] overflow-y-auto">
        {skills.map((s) => (
          <button
            key={s}
            onClick={() => toggleSkill(s)}
            className={cn(
              "text-left text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-2",
              selected.has(s)
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-transparent hover:bg-muted text-foreground"
            )}
          >
            <span className={cn("size-3.5 rounded border flex items-center justify-center shrink-0", selected.has(s) ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
              {selected.has(s) && <span className="text-[9px]">✓</span>}
            </span>
            {skillLabel(s)}
          </button>
        ))}
      </div>
      {selected.size > 0 && (
        <div className="flex gap-1 mb-3">
          {(["training", "certified"] as SkillLevel[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={cn(
                "flex-1 text-[12px] px-2 py-1 rounded-lg border transition-colors",
                level === l
                  ? l === "training"
                    ? "border-amber-300 bg-amber-50 text-amber-700 font-medium"
                    : "border-primary/40 bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-muted text-muted-foreground"
              )}
            >
              {l === "training" ? t("skillLevels.training") : t("skillLevels.certifiedShort")}
            </button>
          ))}
        </div>
      )}
      <Button
        size="sm"
        className="w-full"
        disabled={selected.size === 0 || isPending}
        onClick={() => onConfirm([...selected].map((s) => ({ skill: s as SkillName, level })))}
      >
        {selected.size > 1 ? `${tc("confirm")} (${selected.size})` : tc("confirm")}
      </Button>
    </DropdownPanel>
  )
}

// ── Remove skill dropdown ──────────────────────────────────────────────────────

function RemoveSkillDropdown({
  open, onClose, onConfirm, isPending, skills, skillLabel,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (skills: SkillName[]) => void
  isPending: boolean
  skills: string[]
  skillLabel: (code: string) => string
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) setSelected(new Set())
  }, [open])

  function toggleSkill(s: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  return (
    <DropdownPanel open={open} onClose={onClose} className="w-[240px]">
      <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("dropdowns.removeSkillTitle")}</p>
      <div className="flex flex-col gap-1 mb-3 max-h-[200px] overflow-y-auto">
        {skills.map((s) => (
          <button
            key={s}
            disabled={isPending}
            onClick={() => toggleSkill(s)}
            className={cn(
              "text-left text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-2",
              selected.has(s)
                ? "border-destructive/40 bg-destructive/5 text-destructive font-medium"
                : "border-transparent hover:bg-muted text-foreground"
            )}
          >
            <span className={cn("size-3.5 rounded border flex items-center justify-center shrink-0", selected.has(s) ? "bg-destructive border-destructive text-white" : "border-border")}>
              {selected.has(s) && <span className="text-[9px]">✓</span>}
            </span>
            {skillLabel(s)}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full text-destructive hover:bg-destructive/5"
        disabled={selected.size === 0 || isPending}
        onClick={() => onConfirm([...selected] as SkillName[])}
      >
        {selected.size > 1 ? `${tc("remove")} (${selected.size})` : tc("remove")}
      </Button>
    </DropdownPanel>
  )
}

// ── Status dropdown ────────────────────────────────────────────────────────────

function StatusDropdown({
  open, onClose, onConfirm, isPending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (status: OnboardingStatus) => void
  isPending: boolean
}) {
  const t = useTranslations("staff")
  const options: { value: OnboardingStatus; label: string }[] = [
    { value: "active",      label: t("onboardingStatus.active") },
    { value: "onboarding",  label: t("onboardingStatus.onboarding") },
    { value: "inactive",    label: t("onboardingStatus.inactive") },
  ]
  return (
    <DropdownPanel open={open} onClose={onClose} className="w-[180px]">
      <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("dropdowns.changeStatusTitle")}</p>
      <div className="flex flex-col gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            disabled={isPending}
            onClick={() => onConfirm(o.value)}
            className="text-left text-[13px] px-2.5 py-1.5 rounded-lg border border-transparent hover:bg-muted transition-colors"
          >
            {o.label}
          </button>
        ))}
      </div>
    </DropdownPanel>
  )
}

// ── Delete modal ───────────────────────────────────────────────────────────────

function DeleteModal({
  open,
  names,
  onConfirm,
  onCancel,
  isPending,
}: {
  open: boolean
  names: string[]
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const [confirmText, setConfirmText] = useState("")
  const confirmWord = t("deactivateModal.confirmWord")

  useEffect(() => {
    if (!open) setConfirmText("")
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !isPending && onCancel()} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="size-4 text-destructive" />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-destructive">{t("bulk.deactivate")} {names.length} {names.length !== 1 ? "miembros" : "miembro"}</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">{t("deactivateModal.description")}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 max-h-36 overflow-y-auto">
          {names.map((n) => (
            <p key={n} className="text-[13px] py-0.5">{n}</p>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-muted-foreground">
            {t("deactivateModal.typeToConfirm").split(confirmWord)[0]}
            <span className="font-mono font-medium text-foreground">{confirmWord}</span>
            {t("deactivateModal.typeToConfirm").split(confirmWord)[1]}
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={confirmWord}
            disabled={isPending}
            className="font-mono"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            {tc("cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={confirmText !== confirmWord || isPending}
          >
            {isPending ? t("deactivateModal.deactivating") : t("deactivateModal.confirm")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Hard delete modal ──────────────────────────────────────────────────────────

function HardDeleteModal({
  open, names, onConfirm, onCancel, isPending,
}: {
  open: boolean; names: string[]; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const [confirmText, setConfirmText] = useState("")
  const confirmWord = t("hardDeleteModal.confirmWord")

  useEffect(() => { if (!open) setConfirmText("") }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !isPending && onCancel()} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-destructive/30 bg-background p-6 shadow-xl flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="size-4 text-destructive" />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-destructive">{t("hardDeleteModal.confirm")} {names.length} {names.length !== 1 ? "miembros" : "miembro"}</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">{t("hardDeleteModal.description")}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 max-h-36 overflow-y-auto">
          {names.map((n) => <p key={n} className="text-[13px] py-0.5">{n}</p>)}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-muted-foreground">
            {t("hardDeleteModal.typeToConfirm").split(confirmWord)[0]}
            <span className="font-mono font-medium text-foreground">{confirmWord}</span>
            {t("hardDeleteModal.typeToConfirm").split(confirmWord)[1]}
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={confirmWord}
            disabled={isPending}
            className="font-mono"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>{tc("cancel")}</Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={confirmText !== confirmWord || isPending}
          >
            {isPending ? t("hardDeleteModal.deleting") : t("hardDeleteModal.confirm")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Bulk toolbar ───────────────────────────────────────────────────────────────

function BulkToolbar({
  selectedIds,
  selectedStaff,
  onClear,
  tecnicas: bulkTecnicas,
}: {
  selectedIds: Set<string>
  selectedStaff: StaffWithSkills[]
  onClear: () => void
  tecnicas: Tecnica[]
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const bulkSkills = bulkTecnicas.filter((t) => t.activa).map((t) => t.codigo)
  const bulkSkillLabel = makeSkillLabel(bulkTecnicas)
  const [isPending, startTransition] = useTransition()
  const [addOpen,        setAddOpen]        = useState(false)
  const [removeOpen,     setRemoveOpen]     = useState(false)
  const [statusOpen,     setStatusOpen]     = useState(false)
  const [deleteOpen,     setDeleteOpen]     = useState(false)
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false)

  const count = selectedIds.size
  const ids   = [...selectedIds]
  const selectedMembers = selectedStaff.filter((s) => selectedIds.has(s.id))
  const names = selectedMembers.map((s) => `${s.first_name} ${s.last_name}`)
  const allInactive = selectedMembers.length > 0 && selectedMembers.every((s) => s.onboarding_status === "inactive")

  function closeAll() {
    setAddOpen(false); setRemoveOpen(false); setStatusOpen(false)
  }

  function handleAddSkills(selections: { skill: SkillName; level: SkillLevel }[]) {
    setAddOpen(false)
    startTransition(async () => {
      const result = await bulkAddSkills(ids, selections)
      if (result.error) { toast.error(result.error); return }
      const skippedMsg = result.skipped > 0 ? ` ${t("bulk.skippedAlreadyHad", { count: result.skipped })}` : ""
      toast.success(`${t("bulk.skillAdded", { count: result.added })}${skippedMsg}`)
      onClear()
    })
  }

  function handleRemoveSkills(skills: SkillName[]) {
    setRemoveOpen(false)
    startTransition(async () => {
      const result = await bulkRemoveSkills(ids, skills)
      if (result.error) { toast.error(result.error); return }
      toast.success(t("bulk.skillRemoved", { count: result.removed }))
      onClear()
    })
  }

  function handleStatusChange(status: OnboardingStatus) {
    setStatusOpen(false)
    startTransition(async () => {
      const result = await bulkUpdateStatus(ids, status)
      if (result.error) { toast.error(result.error); return }
      toast.success(t("bulk.statusUpdated", { count: result.updated }))
      onClear()
    })
  }

  function handleDelete() {
    setDeleteOpen(false)
    startTransition(async () => {
      const result = await bulkSoftDeleteStaff(ids)
      if (result.error) { toast.error(result.error); return }
      toast.success(t("bulk.deactivated", { count: result.deleted }))
      onClear()
    })
  }

  function handleHardDelete() {
    setHardDeleteOpen(false)
    startTransition(async () => {
      const result = await hardDeleteStaff(ids)
      if (result.error) { toast.error(result.error); return }
      toast.success(t("bulk.hardDeleted", { count: result.deleted }))
      onClear()
    })
  }

  return (
    <>
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 h-11 rounded-[10px] border border-border bg-background"
        style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.10)" }}
      >
        {/* Count */}
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground shrink-0 whitespace-nowrap">
          <span className="inline-flex items-center justify-center size-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
            {count}
          </span>
          {count !== 1 ? "seleccionados" : "seleccionado"}
        </span>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Add skill */}
        <div className="relative">
          <button
            onClick={() => { closeAll(); setAddOpen((v) => !v) }}
            disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {t("bulk.addSkill")} <ChevronDown className="size-3 shrink-0" />
          </button>
          <AddSkillDropdown
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onConfirm={handleAddSkills}
            isPending={isPending}
            skills={bulkSkills}
            skillLabel={bulkSkillLabel}
          />
        </div>

        {/* Remove skill */}
        <div className="relative">
          <button
            onClick={() => { closeAll(); setRemoveOpen((v) => !v) }}
            disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {t("bulk.removeSkill")} <ChevronDown className="size-3 shrink-0" />
          </button>
          <RemoveSkillDropdown
            open={removeOpen}
            onClose={() => setRemoveOpen(false)}
            onConfirm={handleRemoveSkills}
            isPending={isPending}
            skills={bulkSkills}
            skillLabel={bulkSkillLabel}
          />
        </div>

        {/* Change status */}
        <div className="relative">
          <button
            onClick={() => { closeAll(); setStatusOpen((v) => !v) }}
            disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {t("bulk.changeStatus")} <ChevronDown className="size-3 shrink-0" />
          </button>
          <StatusDropdown
            open={statusOpen}
            onClose={() => setStatusOpen(false)}
            onConfirm={handleStatusChange}
            isPending={isPending}
          />
        </div>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Soft delete */}
        <button
          onClick={() => { closeAll(); setDeleteOpen(true) }}
          disabled={isPending}
          className="flex items-center gap-1 h-7 px-2 rounded-md border border-destructive/30 bg-destructive/5 text-destructive text-[12px] font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <Trash2 className="size-3 shrink-0" />
          {t("bulk.deactivate")}
        </button>

        {/* Hard delete — only when all selected are already inactive */}
        {allInactive && (
          <button
            onClick={() => { closeAll(); setHardDeleteOpen(true) }}
            disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md bg-destructive text-destructive-foreground text-[12px] font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Trash2 className="size-3 shrink-0" />
            {t("bulk.hardDelete")}
          </button>
        )}

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Clear */}
        <button
          onClick={onClear}
          className="flex items-center gap-1 h-7 px-2 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
        >
          <X className="size-3 shrink-0" />
          {tc("cancel")}
        </button>
      </div>

      <DeleteModal
        open={deleteOpen}
        names={names}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        isPending={isPending}
      />
      <HardDeleteModal
        open={hardDeleteOpen}
        names={names}
        onConfirm={handleHardDelete}
        onCancel={() => setHardDeleteOpen(false)}
        isPending={isPending}
      />
    </>
  )
}

// ── Skill badges with overflow ─────────────────────────────────────────────────

function SkillOverflow({ skills, skillLabel, maxVisible, variant, skillOrder }: {
  skills: { skill: string; level: string }[]
  skillLabel: (code: string) => string
  maxVisible: number
  variant: "certified" | "training"
  skillOrder?: Record<string, number>
}) {
  const sorted = skillOrder
    ? [...skills].sort((a, b) => (skillOrder[a.skill] ?? 999) - (skillOrder[b.skill] ?? 999))
    : skills
  const visible  = sorted.slice(0, maxVisible)
  const overflow = sorted.slice(maxVisible)

  const badgeClass = variant === "training"
    ? "shrink-0 inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
    : "shrink-0 inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground"

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visible.map((sk) => (
        <span key={sk.skill} className={badgeClass}>
          {variant === "training" && <Hourglass className="size-2.5 text-amber-500 shrink-0" />}
          {skillLabel(sk.skill)}
        </span>
      ))}
      {overflow.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={
            <span className="shrink-0 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground cursor-default">
              +{overflow.length}
            </span>
          } />
          <TooltipContent side="top">
            {overflow.map((sk) => skillLabel(sk.skill)).join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

// ── Staff table ────────────────────────────────────────────────────────────────

type ColKey = "role" | "email" | "capacidades" | "training" | "status" | "shiftPrefs" | "dayPrefs" | "daysPerWeek" | "workingPattern" | "leaveBalance" | "leaveTaken" | "leaveBooked"

const COL_WIDTHS: Record<ColKey, string> = {
  role: "minmax(0,1fr)",
  email: "minmax(140px,1.5fr)",
  capacidades: "minmax(0,3fr)",
  training: "minmax(200px,2.5fr)",
  status: "minmax(100px,0.8fr)",
  shiftPrefs: "minmax(120px,1.2fr)",
  dayPrefs: "minmax(120px,1.2fr)",
  daysPerWeek: "minmax(55px,0.5fr)",
  workingPattern: "minmax(100px,1fr)",
  leaveBalance: "minmax(80px,0.8fr)",
  leaveTaken: "minmax(70px,0.7fr)",
  leaveBooked: "minmax(70px,0.7fr)",
}

const ALL_COL_ORDER: ColKey[] = ["role", "email", "capacidades", "training", "status", "shiftPrefs", "dayPrefs", "daysPerWeek", "workingPattern", "leaveBalance", "leaveTaken", "leaveBooked"]

function buildGrid(cols: Set<ColKey>, order: ColKey[] = ALL_COL_ORDER) {
  const parts = ["32px", "minmax(0,1.5fr)"]
  for (const key of order) {
    if (cols.has(key)) parts.push(COL_WIDTHS[key])
  }
  return parts.join(" ")
}

const DAY_LABELS: Record<string, string> = { mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" }
const ALL_DAYS_TABLE: string[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

function StaffTable({
  members, t, ts, muted,
  selectedIds, onToggle, onToggleAll, skillLabel,
  deptBorder, deptLabel, skillOrder, tecnicas,
  sortCol, onSortChange,
  visibleCols = new Set(["role", "capacidades", "training", "status"] as ColKey[]), editMode = false, getVal, setEditValue, shiftTypes = [],
  leaveBalances,
  colOrder,
}: {
  members: StaffWithSkills[]
  t: ReturnType<typeof useTranslations<"staff">>
  ts: ReturnType<typeof useTranslations<"skills">>
  muted: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[]) => void
  skillLabel: (code: string) => string
  deptBorder: Record<string, string>
  deptLabel: Record<string, string>
  skillOrder: Record<string, number>
  tecnicas: Tecnica[]
  sortCol?: "name" | "role"
  onSortChange?: (col: "name" | "role") => void
  visibleCols?: Set<ColKey>
  editMode?: boolean
  getVal?: (s: StaffWithSkills, field: string) => unknown
  setEditValue?: (staffId: string, field: string, value: unknown) => void
  shiftTypes?: import("@/lib/types/database").ShiftTypeDefinition[]
  leaveBalances?: Record<string, { name: string; color: string; available: number; taken: number; booked: number }>
  colOrder?: ColKey[]
}) {
  const allSelected = members.length > 0 && members.every((m) => selectedIds.has(m.id))
  const someSelected = members.some((m) => selectedIds.has(m.id))
  const effectiveOrder = colOrder ?? ALL_COL_ORDER

  const headerCells: Record<ColKey, React.ReactNode> = {
    role: <button onClick={() => onSortChange?.("role")} className={cn("text-[13px] font-medium text-left transition-colors", sortCol === "role" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>{t("columns.role")} {sortCol === "role" && "↓"}</button>,
    email: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.email")}</span>,
    capacidades: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.capacidades")}</span>,
    training: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.training")}</span>,
    status: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.status")}</span>,
    shiftPrefs: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.shiftPrefs")}</span>,
    dayPrefs: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.dayPrefs")}</span>,
    daysPerWeek: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.daysPerWeek")}</span>,
    workingPattern: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.workingPattern")}</span>,
    leaveBalance: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.leaveBalance")}</span>,
    leaveTaken: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.leaveTaken")}</span>,
    leaveBooked: <span className="text-[13px] font-medium text-muted-foreground">{t("columns.leaveBooked")}</span>,
  }

  return (
    <div className={cn("rounded-lg border border-border bg-background", muted && "opacity-60")}>
      {/* Header — sticky below toolbar */}
      <div className="hidden md:grid px-4 py-2 bg-background border-b border-border items-center sticky top-[52px] z-10" style={{ gridTemplateColumns: buildGrid(visibleCols, effectiveOrder) }}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
          onChange={() => onToggleAll(members.map((m) => m.id))}
          className="size-4 rounded border-border cursor-pointer accent-primary"
          aria-label={t("selectAll")}
        />
        <button onClick={() => onSortChange?.("name")} className={cn("text-[13px] font-medium text-left transition-colors", sortCol === "name" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {t("columns.name")} {sortCol === "name" && "↓"}
        </button>
        {effectiveOrder.filter(k => visibleCols.has(k)).map(k => (
          <React.Fragment key={k}>{headerCells[k]}</React.Fragment>
        ))}
      </div>

      {/* Rows */}
      {members.map((member, memberIdx) => {
        const skills          = member.staff_skills ?? []
        const certifiedSkills = skills.filter((sk) => sk.level === "certified")
        const trainingSkills  = skills.filter((sk) => sk.level === "training")
        const isSelected      = selectedIds.has(member.id)
        const deptCode        = member.role
        const deptTecnicas    = tecnicas.filter((t) => t.activa && t.department.split(",").includes(deptCode))
        const certifiedCodes  = new Set(certifiedSkills.map((s) => s.skill))
        const allCertified    = deptTecnicas.length > 0 && deptTecnicas.every((t) => certifiedCodes.has(t.codigo))

        return (
          <div
            key={member.id}
            className={cn(
              "grid items-center px-4 py-2.5 min-h-[52px] border-b border-border last:border-0 transition-colors",
              isSelected ? "bg-primary/5" : memberIdx % 2 === 1 ? "bg-muted/30 hover:bg-accent" : "hover:bg-accent"
            )}
            style={{ gridTemplateColumns: buildGrid(visibleCols, effectiveOrder) }}
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(member.id)}
              onClick={(e) => e.stopPropagation()}
              className="size-4 rounded cursor-pointer accent-primary"
              style={{ borderColor: "var(--border)" }}
              aria-label={`Seleccionar ${member.first_name} ${member.last_name}`}
            />

            {/* Name */}
            <div className="flex items-center gap-2 min-w-0 pr-2">
              {editMode && setEditValue ? (
                <StaffColorDot color={String(getVal?.(member, "color") ?? member.color ?? "#D4D4D8")} onChange={(c) => setEditValue(member.id, "color", c)} />
              ) : (
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: member.color || "#D4D4D8" }} />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  {editMode && setEditValue ? (
                    <div className="flex items-center gap-1 min-w-0">
                      <input
                        type="text"
                        value={String(getVal?.(member, "first_name") ?? member.first_name)}
                        onChange={(e) => setEditValue(member.id, "first_name", e.target.value)}
                        className="h-7 w-24 rounded border border-input bg-transparent px-1.5 text-[13px] outline-none"
                      />
                      <input
                        type="text"
                        value={String(getVal?.(member, "last_name") ?? member.last_name)}
                        onChange={(e) => setEditValue(member.id, "last_name", e.target.value)}
                        className="h-7 w-24 rounded border border-input bg-transparent px-1.5 text-[13px] outline-none"
                      />
                    </div>
                  ) : (
                    <Link href={`/staff/${member.id}`} className="text-[14px] font-medium truncate hover:text-primary transition-colors">
                      {member.first_name} {member.last_name}
                    </Link>
                  )}
                  {allCertified && (
                    <Tooltip>
                      <TooltipTrigger render={
                        <Star className="size-3.5 text-amber-400 fill-amber-400 shrink-0 cursor-default" />
                      } />
                      <TooltipContent side="right">Todas las técnicas validadas</TooltipContent>
                    </Tooltip>
                  )}
                  {member.contract_type === "part_time" && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 shrink-0">PT</span>
                  )}
                  {member.contract_type === "intern" && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 shrink-0">INT</span>
                  )}
                  {(() => {
                    const end = member.onboarding_end_date
                    const today = new Date().toISOString().split("T")[0]
                    if (end && today <= end) return (
                      <Tooltip>
                        <TooltipTrigger render={
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0 cursor-default">ONBOARDING</span>
                        } />
                        <TooltipContent side="right">En periodo de incorporación hasta {end}</TooltipContent>
                      </Tooltip>
                    )
                    return null
                  })()}
                  {member.prefers_guardia === true && (
                    <Tooltip>
                      <TooltipTrigger render={
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 shrink-0 cursor-default">G</span>
                      } />
                      <TooltipContent side="right">Voluntario/a de guardia de fin de semana</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>

            {/* Columns rendered in effectiveOrder */}
            {effectiveOrder.filter(k => visibleCols.has(k)).map(k => {
              function cell(): React.ReactNode {
                switch (k) {
                  case "role":
                    return (
                      <div className="hidden md:flex items-center gap-1.5">
                        <span className="w-0.5 h-4 shrink-0 rounded-full" style={{ background: deptBorder[member.role] ?? "#94A3B8" }} />
                        <span className="text-[13px] text-foreground">{deptLabel[member.role] ?? member.role}</span>
                      </div>
                    )
                  case "email":
                    return (
                      <div className="hidden md:flex items-center min-w-0">
                        {editMode && setEditValue ? (
                          <input
                            type="email"
                            value={String(getVal?.(member, "email") ?? member.email ?? "")}
                            onChange={(e) => setEditValue(member.id, "email", e.target.value || null)}
                            placeholder="—"
                            className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-[13px] outline-none"
                          />
                        ) : (
                          <span className={cn("text-[13px] truncate", member.email ? "text-foreground" : "text-muted-foreground/40")}>{member.email ?? "—"}</span>
                        )}
                      </div>
                    )
                  case "capacidades":
                    return (
                      <div className="hidden md:flex items-center gap-1 overflow-hidden">
                        {certifiedSkills.length === 0 ? (
                          <span className="text-[13px] text-muted-foreground/40">—</span>
                        ) : (
                          <SkillOverflow
                            skills={certifiedSkills}
                            skillLabel={skillLabel}
                            maxVisible={4}
                            variant="certified"
                            skillOrder={skillOrder}
                          />
                        )}
                      </div>
                    )
                  case "training":
                    return (
                      <div className="hidden md:flex items-center gap-1 overflow-hidden pr-6">
                        {trainingSkills.length === 0 ? (
                          <span className="text-[13px] text-muted-foreground/40">—</span>
                        ) : (
                          <SkillOverflow
                            skills={trainingSkills}
                            skillLabel={skillLabel}
                            maxVisible={3}
                            variant="training"
                            skillOrder={skillOrder}
                          />
                        )}
                      </div>
                    )
                  case "status":
                    return (
                      <div className="hidden md:flex items-center">
                        {editMode && setEditValue ? (
                          <select
                            value={String(getVal?.(member, "onboarding_status") ?? member.onboarding_status)}
                            onChange={(e) => setEditValue(member.id, "onboarding_status", e.target.value)}
                            className={cn("h-7 rounded border border-input bg-transparent px-1.5 text-[12px] outline-none font-medium",
                              (getVal?.(member, "onboarding_status") ?? member.onboarding_status) === "active" ? "text-emerald-600" :
                              (getVal?.(member, "onboarding_status") ?? member.onboarding_status) === "onboarding" ? "text-amber-600" : "text-muted-foreground"
                            )}
                          >
                            <option value="active">{t("onboardingStatus.active")}</option>
                            <option value="onboarding">{t("onboardingStatus.onboarding")}</option>
                            <option value="inactive">{t("onboardingStatus.inactive")}</option>
                          </select>
                        ) : (
                          <span className={cn(
                            "text-[13px] font-medium",
                            member.onboarding_status === "active"      && "text-emerald-600",
                            member.onboarding_status === "onboarding"  && "text-amber-600",
                            member.onboarding_status === "inactive"    && "text-muted-foreground",
                          )}>
                            {t(`onboardingStatus.${member.onboarding_status}`)}
                          </span>
                        )}
                      </div>
                    )
                  case "shiftPrefs": {
                    const rawPref = getVal?.(member, "preferred_shift") ?? member.preferred_shift
                    const prefs = (rawPref ? String(rawPref) : "").split(",").filter(Boolean)
                    const avoids = (getVal?.(member, "avoid_shifts") ?? member.avoid_shifts ?? []) as string[]
                    return (
                      <div className="hidden md:flex items-center gap-0.5 flex-wrap">
                        {editMode && setEditValue ? (
                          shiftTypes.filter((st) => st.active !== false).map((st) => {
                            const isPref = prefs.includes(st.code)
                            const isAvoid = avoids.includes(st.code)
                            return (
                              <button key={st.code} type="button" onClick={() => {
                                if (!isPref && !isAvoid) {
                                  setEditValue(member.id, "preferred_shift", [...prefs, st.code].join(","))
                                } else if (isPref) {
                                  setEditValue(member.id, "preferred_shift", prefs.filter((c) => c !== st.code).join(","))
                                  setEditValue(member.id, "avoid_shifts", [...avoids, st.code])
                                } else {
                                  setEditValue(member.id, "avoid_shifts", avoids.filter((c) => c !== st.code))
                                }
                              }} className={cn("h-5 px-1.5 rounded text-[9px] font-medium border", isPref ? "bg-[var(--pref-bg)] text-white border-[var(--pref-border)]" : isAvoid ? "bg-[var(--avoid-bg)] text-[var(--avoid-text)] border-[var(--avoid-border)]" : "border-border text-muted-foreground")}>
                                {st.code}
                              </button>
                            )
                          })
                        ) : (
                          <span className="text-[12px] text-muted-foreground">
                            {prefs.length > 0 || avoids.length > 0 ? (
                              <>
                                {prefs.map((c) => <span key={c} className="text-[var(--pref-bg)] font-medium">{c}</span>).reduce<React.ReactNode[]>((a, b, i) => i > 0 ? [...a, " ", b] : [b], [])}
                                {prefs.length > 0 && avoids.length > 0 && " · "}
                                {avoids.map((c) => <span key={c} className="text-[var(--avoid-text)]">{c}</span>).reduce<React.ReactNode[]>((a, b, i) => i > 0 ? [...a, " ", b] : [b], [])}
                              </>
                            ) : "—"}
                          </span>
                        )}
                      </div>
                    )
                  }
                  case "dayPrefs": {
                    const pDays = (getVal?.(member, "preferred_days") ?? member.preferred_days ?? []) as string[]
                    const aDays = (getVal?.(member, "avoid_days") ?? member.avoid_days ?? []) as string[]
                    return (
                      <div className="hidden md:flex items-center gap-0.5 flex-wrap">
                        {editMode && setEditValue ? (
                          ALL_DAYS_TABLE.map((d) => {
                            const isPref = pDays.includes(d)
                            const isAvoid = aDays.includes(d)
                            return (
                              <button key={d} type="button" onClick={() => {
                                if (!isPref && !isAvoid) {
                                  setEditValue(member.id, "preferred_days", [...pDays, d])
                                } else if (isPref) {
                                  setEditValue(member.id, "preferred_days", pDays.filter((x) => x !== d))
                                  setEditValue(member.id, "avoid_days", [...aDays, d])
                                } else {
                                  setEditValue(member.id, "avoid_days", aDays.filter((x) => x !== d))
                                }
                              }} className={cn("size-5 rounded text-[9px] font-medium border", isPref ? "bg-[var(--pref-bg)] text-white border-[var(--pref-border)]" : isAvoid ? "bg-[var(--avoid-bg)] text-[var(--avoid-text)] border-[var(--avoid-border)]" : "border-border text-muted-foreground")}>
                                {DAY_LABELS[d]}
                              </button>
                            )
                          })
                        ) : (
                          <span className="text-[12px] text-muted-foreground">
                            {pDays.length > 0 || aDays.length > 0 ? (
                              <>
                                {pDays.map((d) => <span key={d} className="text-[var(--pref-bg)] font-medium">{DAY_LABELS[d]}</span>).reduce<React.ReactNode[]>((a, b, i) => i > 0 ? [...a, " ", b] : [b], [])}
                                {pDays.length > 0 && aDays.length > 0 && " · "}
                                {aDays.map((d) => <span key={d} className="text-[var(--avoid-text)]">{DAY_LABELS[d]}</span>).reduce<React.ReactNode[]>((a, b, i) => i > 0 ? [...a, " ", b] : [b], [])}
                              </>
                            ) : "—"}
                          </span>
                        )}
                      </div>
                    )
                  }
                  case "daysPerWeek":
                    return (
                      <div className="hidden md:flex items-center">
                        {editMode && setEditValue ? (
                          <input
                            type="number" min={1} max={7}
                            value={Number(getVal?.(member, "days_per_week") ?? member.days_per_week)}
                            onChange={(e) => setEditValue(member.id, "days_per_week", Math.min(7, Math.max(1, parseInt(e.target.value) || 5)))}
                            className="h-7 w-12 rounded border border-input bg-transparent px-1.5 text-[12px] text-center outline-none"
                          />
                        ) : (
                          <span className="text-[13px] text-muted-foreground">{member.days_per_week}</span>
                        )}
                      </div>
                    )
                  case "workingPattern":
                    return (
                      <div className="hidden md:flex items-center gap-0.5 flex-wrap">
                        {editMode && setEditValue ? (
                          ALL_DAYS_TABLE.map((d) => {
                            const wp = (getVal?.(member, "working_pattern") as string[] | null) ?? []
                            const active = wp.includes(d)
                            return (
                              <button key={d} type="button" onClick={() => {
                                const next = active ? wp.filter((x) => x !== d) : [...wp, d]
                                setEditValue(member.id, "working_pattern", next)
                              }} className={cn("size-5 rounded text-[9px] font-medium border", active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
                                {DAY_LABELS[d]}
                              </button>
                            )
                          })
                        ) : (
                          <span className="text-[12px] text-muted-foreground">
                            {(member.working_pattern ?? []).map((d) => DAY_LABELS[d] ?? d).join(" ") || "—"}
                          </span>
                        )}
                      </div>
                    )
                  case "leaveBalance": {
                    const b = leaveBalances?.[member.id]
                    return (
                      <div className="hidden md:flex items-center gap-1.5">
                        {b ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                            <span className={cn("text-[13px] tabular-nums", b.available <= 0 ? "text-destructive font-medium" : "text-foreground")}>{b.available}</span>
                          </>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </div>
                    )
                  }
                  case "leaveTaken": {
                    const b = leaveBalances?.[member.id]
                    return (
                      <div className="hidden md:flex items-center">
                        {b !== undefined ? (
                          <span className="text-[13px] tabular-nums text-muted-foreground">{b.taken}</span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </div>
                    )
                  }
                  case "leaveBooked": {
                    const b = leaveBalances?.[member.id]
                    return (
                      <div className="hidden md:flex items-center">
                        {b !== undefined ? (
                          <span className="text-[13px] tabular-nums text-muted-foreground">{b.booked}</span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </div>
                    )
                  }
                  default:
                    return null
                }
              }
              return <React.Fragment key={k}>{cell()}</React.Fragment>
            })}

          </div>
        )
      })}
    </div>
  )
}

// ── Staff list ─────────────────────────────────────────────────────────────────

export function StaffList({ staff, tecnicas = [], departments: deptsProp = [], shiftTypes = [], maxStaff = 50, leaveBalances }: { staff: StaffWithSkills[]; tecnicas?: Tecnica[]; departments?: import("@/lib/types/database").Department[]; shiftTypes?: import("@/lib/types/database").ShiftTypeDefinition[]; maxStaff?: number; leaveBalances?: Record<string, { name: string; color: string; available: number; taken: number; booked: number }> }) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")
  const locale = useLocale() as "es" | "en"
  const router = useRouter()
  const searchParams = useSearchParams()

  // Show success toast after create/edit redirect
  useEffect(() => {
    if (searchParams.get("saved") === "1") {
      toast.success(tc("savedSuccessfully"))
      router.replace("/staff", { scroll: false })
    }
  }, [searchParams, tc, router])
  const skillLabel = makeSkillLabel(tecnicas)
  const skillOrder = Object.fromEntries(tecnicas.map((t, i) => [t.codigo, i]))
  const deptBorder: Record<string, string> = { ...ROLE_BORDER_COLOR }
  const deptLabel: Record<string, string> = { lab: "Embriología", andrology: "Andrología", admin: "Admin" }
  for (const d of deptsProp) { deptBorder[d.code] = d.colour; deptLabel[d.code] = d.name }

  // Optimal headcount KPI
  const [headcount, setHeadcount] = useState<HeadcountResult | null>(null)
  const [headcountLoading, setHeadcountLoading] = useState(false)
  const [headcountOpen, setHeadcountOpen] = useState(false)
  const headcountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cached = localStorage.getItem("labrota_headcount")
    if (cached) {
      try { setHeadcount(JSON.parse(cached)) } catch { /* ignore */ }
    } else {
      // First time — auto-calculate
      setHeadcountLoading(true)
      calculateOptimalHeadcount().then((res) => {
        if (res.data) {
          setHeadcount(res.data)
          localStorage.setItem("labrota_headcount", JSON.stringify(res.data))
        } else {
          console.error("Headcount calculation failed:", res.error)
        }
        setHeadcountLoading(false)
      })
    }
  }, [])

  useEffect(() => {
    if (!headcountOpen) return
    function h(e: MouseEvent) { if (headcountRef.current && !headcountRef.current.contains(e.target as Node)) setHeadcountOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [headcountOpen])

  async function recalculateHeadcount() {
    setHeadcountLoading(true)
    const res = await calculateOptimalHeadcount()
    if (res.data) {
      setHeadcount(res.data)
      localStorage.setItem("labrota_headcount", JSON.stringify(res.data))
      toast.success(locale === "es" ? "Plantilla óptima recalculada" : "Optimal headcount recalculated")
    } else {
      toast.error(res.error ?? "Error")
    }
    setHeadcountLoading(false)
  }

  const [search,       setSearch]       = useState("")
  const [roleFilter,   setRoleFilter]   = useState<StaffRole | "all">("all")
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | "all">("all")
  const [skillFilter,  setSkillFilter]  = useState<string>("all")
  const [showHistory,  setShowHistory]  = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [sortCol,      setSortCol]      = useState<"name" | "role">("name")

  // Column visibility
  type ColKey = "role" | "email" | "capacidades" | "training" | "status" | "shiftPrefs" | "dayPrefs" | "daysPerWeek" | "workingPattern" | "leaveBalance" | "leaveTaken" | "leaveBooked"
  const DEFAULT_COLS: ColKey[] = ["role", "capacidades", "training", "status"]
  const STORAGE_KEY = "labrota_staff_columns"
  const ORDER_KEY = "labrota_staff_col_order"
  const hrActive = !!leaveBalances
  const HR_KEYS: ColKey[] = ["leaveBalance", "leaveTaken", "leaveBooked"]
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const cols = new Set(JSON.parse(saved) as ColKey[])
          if (!hrActive) HR_KEYS.forEach((k) => cols.delete(k))
          return cols
        }
      } catch { /* ignore */ }
    }
    return new Set(DEFAULT_COLS)
  })
  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(ORDER_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as ColKey[]
          // Append any new keys from ALL_COL_ORDER that aren't in saved order
          const extra = ALL_COL_ORDER.filter((k) => !parsed.includes(k))
          return [...parsed, ...extra]
        }
      } catch { /* ignore */ }
    }
    return [...ALL_COL_ORDER]
  })
  const [showColDialog, setShowColDialog] = useState(false)
  const [draftOrder, setDraftOrder] = useState<ColKey[]>([])
  const [draftVisible, setDraftVisible] = useState<Set<ColKey>>(new Set())
  const dragColIdx = useRef<number | null>(null)

  function openColDialog() {
    setDraftOrder([...colOrder])
    setDraftVisible(new Set(visibleCols))
    setShowColDialog(true)
  }

  function saveColPrefs() {
    setColOrder(draftOrder)
    setVisibleCols(draftVisible)
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(draftOrder))
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...draftVisible]))
    } catch { /* ignore */ }
    setShowColDialog(false)
  }

  const ALL_COLUMNS: { key: ColKey; label: string }[] = [
    { key: "role", label: t("columnMenu.role") },
    { key: "email", label: t("columnMenu.email") },
    { key: "capacidades", label: t("columnMenu.capacidades") },
    { key: "training", label: t("columnMenu.training") },
    { key: "status", label: t("columnMenu.status") },
    { key: "shiftPrefs", label: t("columnMenu.shiftPrefs") },
    { key: "dayPrefs", label: t("columnMenu.dayPrefs") },
    { key: "daysPerWeek", label: t("columnMenu.daysPerWeek") },
    { key: "workingPattern", label: t("columnMenu.workingPattern") },
    ...(hrActive ? [
      { key: "leaveBalance" as ColKey, label: t("columnMenu.leaveBalance") },
      { key: "leaveTaken" as ColKey, label: t("columnMenu.leaveTaken") },
      { key: "leaveBooked" as ColKey, label: t("columnMenu.leaveBooked") },
    ] : []),
  ]

  // Inline edit mode
  const [editMode, setEditMode] = useState(false)
  const [editDirty, setEditDirty] = useState<Map<string, Record<string, unknown>>>(new Map())
  const [isSaving, startSaving] = useTransition()

  function setEditValue(staffId: string, field: string, value: unknown) {
    setEditDirty((prev) => {
      const next = new Map(prev)
      const row = next.get(staffId) ?? {}
      row[field] = value
      next.set(staffId, row)
      return next
    })
  }

  async function saveEdits() {
    const updates: { id: string; field: string; value: unknown }[] = []
    for (const [staffId, fields] of editDirty) {
      for (const [field, value] of Object.entries(fields)) {
        updates.push({ id: staffId, field, value })
      }
    }
    if (updates.length === 0) { setEditMode(false); return }
    startSaving(async () => {
      const result = await bulkUpdateStaffField(updates)
      if (result.error) toast.error(result.error)
      else toast.success(t("bulk.fieldsUpdated", { count: result.updated }))
      setEditDirty(new Map())
      setEditMode(false)
    })
  }

  // Get current value for a field, with edit override
  function getVal(s: StaffWithSkills, field: string): unknown {
    return editDirty.get(s.id)?.[field] ?? s[field as keyof StaffWithSkills]
  }

  const filtered = staff.filter((s) => {
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
    if (search && !fullName.includes(search.toLowerCase())) return false
    if (roleFilter   !== "all" && s.role              !== roleFilter)   return false
    if (statusFilter !== "all" && s.onboarding_status !== statusFilter) return false
    if (skillFilter  !== "all" && !s.staff_skills.some((sk) => sk.skill === skillFilter && sk.level === "certified")) return false
    return true
  })

  const sortFn = sortCol === "name" ? sortByName : sortByRole
  const activeFiltered   = filtered.filter((s) => s.onboarding_status !== "inactive").sort(sortFn)
  const inactiveFiltered = filtered.filter((s) => s.onboarding_status === "inactive").sort(sortFn)

  // Collect all unique skill codes for the filter dropdown
  // Show all active técnicas in the filter, not just ones already assigned to staff
  const allSkillCodes = [...new Set([
    ...tecnicas.filter((t) => t.activa).map((t) => t.codigo),
    ...staff.flatMap((s) => s.staff_skills.map((sk) => sk.skill)),
  ])].sort()

  const hasFilters = search || roleFilter !== "all" || statusFilter !== "all" || skillFilter !== "all"

  // All currently visible staff IDs (respects filters)
  const visibleIds = [
    ...activeFiltered,
    ...(showHistory ? inactiveFiltered : []),
  ]

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(ids: string[]) {
    const allSelected = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        ids.forEach((id) => next.delete(id))
      } else {
        ids.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  // Keep selectedIds scoped to visible staff only
  const visibleIdSet = new Set(visibleIds.map((s) => s.id))
  const effectiveSelectedIds = new Set([...selectedIds].filter((id) => visibleIdSet.has(id)))

  // KPI metrics (computed once, rendered above toolbar)
  const kpiActiveStaff = staff.filter((s) => s.onboarding_status !== "inactive")
  const kpiActiveOnly = staff.filter((s) => s.onboarding_status === "active")
  const kpiAvailable = maxStaff - kpiActiveOnly.length
  const isOverLimit = kpiActiveOnly.length > maxStaff
  const kpiActiveTecnicas = tecnicas.filter((t) => t.activa)
  const kpiAllCodes = kpiActiveTecnicas.map((t) => t.codigo)
  const kpiCoveredCount = kpiAllCodes.filter((code) =>
    kpiActiveStaff.filter((s) => s.staff_skills.some((sk) => sk.skill === code && sk.level === "certified")).length >= 2
  ).length
  const kpiFullyValidated = kpiActiveStaff.filter((s) => {
    if (s.role === "admin") return false
    const deptTecnicas = kpiActiveTecnicas.filter((t) => t.department.split(",").includes(s.role))
    if (deptTecnicas.length === 0) return false
    const certifiedCodes = new Set(s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill))
    return deptTecnicas.every((t) => certifiedCodes.has(t.codigo))
  }).length

  return (
    <div className="flex flex-col">
      {/* KPI summary band */}
      {staff.length > 0 && (
        <div className="-mx-6 md:-mx-8 -mt-6 md:-mt-8 px-6 md:px-8 pt-6 md:pt-8 pb-5 bg-muted/40 border-b border-border mb-5">
          <div className="grid grid-cols-5 gap-3">
            {/* Active headcount */}
            <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{t("kpiActive")}</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-[22px] font-semibold text-foreground leading-tight">{kpiActiveStaff.length}</p>
                <div className="flex items-center gap-1">
                  {deptsProp.filter((d) => kpiActiveStaff.some((s) => s.role === d.code)).map((d) => {
                    const count = kpiActiveStaff.filter((s) => s.role === d.code).length
                    return (
                      <Tooltip key={d.code}>
                        <TooltipTrigger render={
                          <span className="text-[10px] px-1 py-0.5 rounded cursor-default" style={{ backgroundColor: `${deptBorder[d.code] ?? "#94A3B8"}20`, color: deptBorder[d.code] ?? "#94A3B8" }}>
                            {count}
                          </span>
                        } />
                        <TooltipContent side="bottom">{d.name}: {count}</TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Minimum headcount (recommended) */}
            <div ref={headcountRef} className="relative rounded-xl border border-border/60 bg-background px-4 py-3">
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">
                  {t("kpiOptimalHeadcount")} <span className="normal-case font-normal">({locale === "es" ? "recomendado" : "recommended"})</span>
                </p>
                <button
                  onClick={() => setHeadcountOpen(!headcountOpen)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Info className="size-3" />
                </button>
              </div>
              {headcountLoading ? (
                <div className="h-7 w-12 rounded bg-muted animate-pulse mt-1" />
              ) : headcount ? (
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-[22px] font-semibold text-foreground leading-tight">{headcount.total}</p>
                  <div className="flex items-center gap-1">
                    {headcount.breakdown.map((d) => (
                      <span key={d.department} className="text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: `${deptBorder[d.department] ?? "#94A3B8"}20`, color: deptBorder[d.department] ?? "#94A3B8" }}>
                        {d.headcount}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[22px] font-semibold text-muted-foreground mt-0.5 leading-tight">—</p>
              )}

              {/* Explainer popover */}
              {headcountOpen && headcount && (
                <div className="absolute left-0 top-full mt-1 z-50 w-[340px] rounded-xl border border-border bg-background shadow-xl p-4 flex flex-col gap-3">
                  <p className="text-[13px] text-muted-foreground">{headcount.explanation}</p>
                  <div className="flex flex-col gap-2">
                    {headcount.breakdown.map((d) => (
                      <div key={d.department} className="flex items-start gap-2">
                        <span
                          className="mt-1 size-2 rounded-full shrink-0"
                          style={{ backgroundColor: deptBorder[d.department] ?? "#94A3B8" }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[13px] font-medium">{d.label}</span>
                            <span className="text-[13px] font-semibold">{d.headcount}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{d.explanation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={recalculateHeadcount}
                    disabled={headcountLoading}
                    className="flex items-center gap-1.5 text-[12px] text-primary hover:underline self-end disabled:opacity-50"
                  >
                    <RefreshCw className={cn("size-3", headcountLoading && "animate-spin")} />
                    {locale === "es" ? "Recalcular" : "Recalculate"}
                  </button>
                </div>
              )}
            </div>

            {/* Training */}
            <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{t("kpiTraining")}</p>
              <p className="text-[22px] font-semibold text-foreground mt-0.5 leading-tight">{kpiActiveStaff.filter((s) => s.staff_skills.some((sk) => sk.level === "training")).length}</p>
            </div>

            {/* Full Validation */}
            <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
              <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{t("kpiFullValidation")}</p>
              <p className="text-[22px] font-semibold text-foreground mt-0.5 leading-tight">{kpiFullyValidated}</p>
            </div>

            {/* Available slots */}
            <div className={cn("rounded-xl border bg-background px-4 py-3", isOverLimit ? "border-destructive/40" : "border-border/60")}>
              <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{t("kpiAvailable")}</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <p className={cn("text-[22px] font-semibold leading-tight", isOverLimit ? "text-destructive" : "text-foreground")}>
                  {kpiAvailable}
                </p>
                <p className="text-[14px] text-muted-foreground">/ {maxStaff}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Over-limit banner */}
      {isOverLimit && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 mb-1">
          <span className="text-destructive mt-0.5">⚠</span>
          <p className="text-[13px] text-destructive leading-snug">
            {locale === "es"
              ? <>Has superado el límite contratado de <strong>{maxStaff}</strong> miembros activos. Contacta con <strong>info@labrota.app</strong> para ampliar tu suscripción.</>
              : <>You have exceeded your contracted limit of <strong>{maxStaff}</strong> active staff members. Contact <strong>info@labrota.app</strong> to upgrade your subscription.</>
            }
          </p>
        </div>
      )}

      {/* Content section */}
      <div className="flex flex-col gap-4">
      {/* Toolbar — sticky */}
      <div className="flex items-center justify-between gap-3 sticky top-0 z-20 bg-background pt-1 pb-3 -mx-6 px-6 md:-mx-8 md:px-8 border-b border-border">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-48 h-8 text-[13px]"
          />
          {/* Compact filter chips */}
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as StaffRole | "all"); clearSelection() }} className="h-8 rounded-md border border-input bg-transparent px-2 text-[12px] outline-none">
            <option value="all">{t("allRoles")}</option>
            <option value="lab">{t("roles.lab")}</option>
            <option value="andrology">{t("roles.andrology")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </select>
          {allSkillCodes.length > 0 && (
            <select value={skillFilter} onChange={(e) => { setSkillFilter(e.target.value); clearSelection() }} className="h-8 rounded-md border border-input bg-transparent px-2 text-[12px] outline-none">
              <option value="all">{t("allSkills")}</option>
              {allSkillCodes.map((code) => <option key={code} value={code}>{skillLabel(code)}</option>)}
            </select>
          )}
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as OnboardingStatus | "all"); clearSelection() }} className="h-8 rounded-md border border-input bg-transparent px-2 text-[12px] outline-none">
            <option value="all">{t("allStatuses")}</option>
            <option value="active">{t("onboardingStatus.active")}</option>
            <option value="onboarding">{t("onboardingStatus.onboarding")}</option>
            <option value="inactive">{t("onboardingStatus.inactive")}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {/* Column toggle */}
          <button
            onClick={openColDialog}
            className={cn("h-9 px-2.5 rounded-lg border text-[13px] flex items-center gap-1.5 transition-colors", visibleCols.size !== DEFAULT_COLS.length || !DEFAULT_COLS.every((c) => visibleCols.has(c)) ? "border-primary/30 text-primary bg-primary/5" : "border-input text-muted-foreground hover:text-foreground")}
          >
            <Columns3 className="size-4" />
          </button>
          {/* Edit mode toggle */}
          {editMode ? (
            <>
              <button
                onClick={() => { setEditDirty(new Map()); setEditMode(false) }}
                className="h-9 px-3 rounded-lg border border-input text-[13px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdits}
                disabled={isSaving}
                className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="size-3.5" />
                {isSaving ? "Guardando..." : "Guardar"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="h-9 px-2.5 rounded-lg border border-input text-[13px] text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          <Button size="lg" render={<Link href="/staff/new" />}>
            <Plus className="size-4" />
            {t("addStaff")}
          </Button>
        </div>
      </div>

      {/* Empty state — no staff at all */}
      {staff.length === 0 && (
        <EmptyState
          icon={Users}
          title={t("noStaff")}
          description={t("noStaffDescription")}
          action={{ label: t("addStaff"), onClick: () => router.push("/staff/new") }}
        />
      )}

      {/* Empty state — no results after filtering */}
      {staff.length > 0 && activeFiltered.length === 0 && inactiveFiltered.length === 0 && hasFilters && (
        <EmptyState
          icon={Users}
          title={t("noResults")}
          description={t("noResultsDescription")}
        />
      )}

      {/* Active / onboarding table */}
      {activeFiltered.length > 0 && (
        <StaffTable
          members={activeFiltered}
          t={t}
          ts={ts}
          muted={false}
          selectedIds={effectiveSelectedIds}
          onToggle={toggleOne}
          onToggleAll={toggleAll}
          skillLabel={skillLabel}
          deptBorder={deptBorder}
          deptLabel={deptLabel}
          skillOrder={skillOrder}
          tecnicas={tecnicas}
          sortCol={sortCol}
          onSortChange={setSortCol}
          visibleCols={visibleCols}
          editMode={editMode}
          getVal={getVal}
          setEditValue={setEditValue}
          shiftTypes={shiftTypes}
          leaveBalances={leaveBalances}
          colOrder={colOrder}
        />
      )}

      {/* History toggle */}
      {inactiveFiltered.length > 0 && (
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          {showHistory ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {showHistory
            ? t("hideHistory")
            : t("showHistory", { count: inactiveFiltered.length })}
        </button>
      )}

      {/* Inactive table */}
      {showHistory && inactiveFiltered.length > 0 && (
        <StaffTable
          members={inactiveFiltered}
          t={t}
          ts={ts}
          muted
          selectedIds={effectiveSelectedIds}
          onToggle={toggleOne}
          onToggleAll={toggleAll}
          skillLabel={skillLabel}
          deptBorder={deptBorder}
          deptLabel={deptLabel}
          skillOrder={skillOrder}
          tecnicas={tecnicas}
          colOrder={colOrder}
        />
      )}

      {/* Bulk toolbar */}
      {effectiveSelectedIds.size > 0 && (
        <BulkToolbar
          selectedIds={effectiveSelectedIds}
          selectedStaff={staff}
          onClear={clearSelection}
          tecnicas={tecnicas}
        />
      )}
      </div>

      {/* Column customization dialog */}
      {showColDialog && (
        <div className="fixed inset-0 z-50 flex items-start justify-end pt-14 pr-4" onClick={() => setShowColDialog(false)}>
          <div className="bg-background border border-border rounded-xl shadow-xl w-64 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[14px] font-medium">{locale === "es" ? "Columnas" : "Columns"}</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">{locale === "es" ? "Arrastra para reordenar" : "Drag to reorder"}</p>
            </div>
            <div className="py-1 max-h-[60vh] overflow-y-auto">
              {draftOrder.map((key, i) => {
                const col = ALL_COLUMNS.find(c => c.key === key)
                if (!col) return null
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => { dragColIdx.current = i }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dragColIdx.current === null || dragColIdx.current === i) return
                      const next = [...draftOrder]
                      const [item] = next.splice(dragColIdx.current, 1)
                      next.splice(i, 0, item)
                      dragColIdx.current = i
                      setDraftOrder(next)
                    }}
                    onDragEnd={() => { dragColIdx.current = null }}
                    className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent transition-colors cursor-grab active:cursor-grabbing select-none"
                  >
                    <GripVertical className="size-4 text-muted-foreground/40 shrink-0" />
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(draftVisible)
                        next.has(key) ? next.delete(key) : next.add(key)
                        setDraftVisible(next)
                      }}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <span className={cn("size-4 rounded border flex items-center justify-center shrink-0", draftVisible.has(key) ? "bg-primary border-primary text-white" : "border-border")}>
                        {draftVisible.has(key) && <Check className="size-3" />}
                      </span>
                      <span className="text-[13px]">{col.label}</span>
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="px-3 py-3 border-t border-border flex items-center gap-2">
              <button onClick={saveColPrefs} className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors">
                {locale === "es" ? "Guardar" : "Save"}
              </button>
              <button onClick={() => setShowColDialog(false)} className="h-8 px-3 rounded-lg border border-input text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                {locale === "es" ? "Cancelar" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
