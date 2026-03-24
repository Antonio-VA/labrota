"use client"

import { useState, useRef, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Users, Pencil, Plus, X, ChevronDown, ChevronRight, Trash2, Hourglass, Star } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills, StaffRole, OnboardingStatus, SkillName, SkillLevel, Tecnica } from "@/lib/types/database"
import {
  bulkAddSkill,
  bulkRemoveSkill,
  bulkUpdateStatus,
  bulkSoftDeleteStaff,
  hardDeleteStaff,
} from "@/app/(clinic)/staff/actions"

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
  onConfirm: (skill: SkillName, level: SkillLevel) => void
  isPending: boolean
  skills: string[]
  skillLabel: (code: string) => string
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const [skill, setSkill] = useState<SkillName | null>(null)
  const [level, setLevel] = useState<SkillLevel>("certified")

  useEffect(() => {
    if (!open) { setSkill(null); setLevel("certified") }
  }, [open])

  return (
    <DropdownPanel open={open} onClose={onClose} className="w-[240px]">
      <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("dropdowns.addSkillTitle")}</p>
      <div className="flex flex-col gap-1 mb-3">
        {skills.map((s) => (
          <button
            key={s}
            onClick={() => setSkill(s)}
            className={cn(
              "text-left text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors",
              skill === s
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-transparent hover:bg-muted text-foreground"
            )}
          >
            {skillLabel(s)}
          </button>
        ))}
      </div>
      {skill && (
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
        disabled={!skill || isPending}
        onClick={() => skill && onConfirm(skill, level)}
      >
        {tc("confirm")}
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
  onConfirm: (skill: SkillName) => void
  isPending: boolean
  skills: string[]
  skillLabel: (code: string) => string
}) {
  const t  = useTranslations("staff")
  return (
    <DropdownPanel open={open} onClose={onClose} className="w-[220px]">
      <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("dropdowns.removeSkillTitle")}</p>
      <div className="flex flex-col gap-1">
        {skills.map((s) => (
          <button
            key={s}
            disabled={isPending}
            onClick={() => onConfirm(s)}
            className="text-left text-[13px] px-2.5 py-1.5 rounded-lg border border-transparent hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive transition-colors"
          >
            {skillLabel(s)}
          </button>
        ))}
      </div>
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

  function handleAddSkill(skill: SkillName, level: SkillLevel) {
    setAddOpen(false)
    startTransition(async () => {
      const result = await bulkAddSkill(ids, skill, level)
      if (result.error) { toast.error(result.error); return }
      const skippedMsg = result.skipped > 0 ? ` ${t("bulk.skippedAlreadyHad", { count: result.skipped })}` : ""
      toast.success(`${t("bulk.skillAdded", { count: result.added })}${skippedMsg}`)
      onClear()
    })
  }

  function handleRemoveSkill(skill: SkillName) {
    setRemoveOpen(false)
    startTransition(async () => {
      const result = await bulkRemoveSkill(ids, skill)
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
            onConfirm={handleAddSkill}
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
            onConfirm={handleRemoveSkill}
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

const GRID = "grid-cols-[32px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,3fr)_minmax(300px,2.5fr)_minmax(120px,0.8fr)_40px]"

function StaffTable({
  members, t, ts, muted,
  selectedIds, onToggle, onToggleAll, skillLabel,
  deptBorder, deptLabel, skillOrder, tecnicas,
  sortCol, onSortChange,
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
}) {
  const allSelected = members.length > 0 && members.every((m) => selectedIds.has(m.id))
  const someSelected = members.some((m) => selectedIds.has(m.id))

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden bg-background", muted && "opacity-60")}>
      {/* Header */}
      <div className={cn("hidden md:grid px-4 py-2 bg-background border-b border-border items-center", GRID)}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
          onChange={() => onToggleAll(members.map((m) => m.id))}
          className="size-4 rounded border-border cursor-pointer accent-primary"
          aria-label="Seleccionar todos"
        />
        <button onClick={() => onSortChange?.("name")} className={cn("text-[13px] font-medium text-left transition-colors", sortCol === "name" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {t("columns.name")} {sortCol === "name" && "↓"}
        </button>
        <button onClick={() => onSortChange?.("role")} className={cn("text-[13px] font-medium text-left transition-colors", sortCol === "role" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {t("columns.role")} {sortCol === "role" && "↓"}
        </button>
        <span className="text-[13px] font-medium text-muted-foreground">{t("columns.capacidades")}</span>
        <span className="text-[13px] font-medium text-muted-foreground">{t("columns.training")}</span>
        <span className="text-[13px] font-medium text-muted-foreground">{t("columns.status")}</span>
        <span />
      </div>

      {/* Rows */}
      {members.map((member) => {
        const skills          = member.staff_skills ?? []
        const certifiedSkills = skills.filter((sk) => sk.level === "certified")
        const trainingSkills  = skills.filter((sk) => sk.level === "training")
        const isSelected      = selectedIds.has(member.id)
        const isAdmin         = member.role === "admin"
        const deptCode        = member.role
        const deptTecnicas    = tecnicas.filter((t) => t.activa && t.department === deptCode)
        const certifiedCodes  = new Set(certifiedSkills.map((s) => s.skill))
        const allCertified    = !isAdmin && deptTecnicas.length > 0 && deptTecnicas.every((t) => certifiedCodes.has(t.codigo))

        return (
          <div
            key={member.id}
            className={cn(
              "grid items-center px-4 py-2.5 min-h-[52px] border-b border-border last:border-0 transition-colors",
              "grid-cols-[32px_1fr_auto] md:grid-cols-[32px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,3fr)_minmax(300px,2.5fr)_minmax(120px,0.8fr)_40px]",
              isSelected ? "bg-primary/5" : "hover:bg-accent"
            )}
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
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: member.color || "#D4D4D8" }} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-[14px] font-medium truncate">
                    {member.first_name} {member.last_name}
                  </p>
                  {allCertified && (
                    <Tooltip>
                      <TooltipTrigger render={
                        <Star className="size-3.5 text-amber-400 fill-amber-400 shrink-0 cursor-default" />
                      } />
                      <TooltipContent side="right">Todas las técnicas validadas</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {member.email && (
                  <p className="text-[13px] text-muted-foreground truncate">{member.email}</p>
                )}
              </div>
            </div>

            {/* Department */}
            <div className="hidden md:flex items-center">
              <span
                className="inline-flex items-center bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground border border-border"
                style={{ borderLeft: `3px solid ${deptBorder[member.role] ?? "#94A3B8"}`, borderRadius: 4 }}
              >
                {deptLabel[member.role] ?? member.role}
              </span>
            </div>

            {/* Técnicas (certified) */}
            <div className="hidden md:flex items-center gap-1 overflow-hidden">
              {isAdmin || certifiedSkills.length === 0 ? (
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

            {/* En formación (training) */}
            <div className="hidden md:flex items-center gap-1 overflow-hidden pr-6">
              {isAdmin || trainingSkills.length === 0 ? (
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

            {/* Status */}
            <div className="hidden md:flex items-center">
              <span className={cn(
                "text-[13px] font-medium",
                member.onboarding_status === "active"      && "text-emerald-600",
                member.onboarding_status === "onboarding"  && "text-amber-600",
                member.onboarding_status === "inactive"    && "text-muted-foreground",
              )}>
                {t(`onboardingStatus.${member.onboarding_status}`)}
              </span>
            </div>

            {/* Edit */}
            <div className="flex items-center justify-end">
              <Link
                href={`/staff/${member.id}`}
                aria-label={t("editStaff")}
                className="flex items-center justify-center size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent hover:text-blue-600 transition-colors"
              >
                <Pencil className="size-4" />
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Staff list ─────────────────────────────────────────────────────────────────

export function StaffList({ staff, tecnicas = [], departments: deptsProp = [] }: { staff: StaffWithSkills[]; tecnicas?: Tecnica[]; departments?: import("@/lib/types/database").Department[] }) {
  const t  = useTranslations("staff")
  const ts = useTranslations("skills")
  const router = useRouter()
  const skillLabel = makeSkillLabel(tecnicas)
  const skillOrder = Object.fromEntries(tecnicas.map((t, i) => [t.codigo, i]))
  const deptBorder: Record<string, string> = { ...ROLE_BORDER_COLOR }
  const deptLabel: Record<string, string> = { lab: "Embriología", andrology: "Andrología", admin: "Admin" }
  for (const d of deptsProp) { deptBorder[d.code] = d.colour; deptLabel[d.code] = d.name }

  const [search,       setSearch]       = useState("")
  const [roleFilter,   setRoleFilter]   = useState<StaffRole | "all">("all")
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | "all">("all")
  const [skillFilter,  setSkillFilter]  = useState<string>("all")
  const [showHistory,  setShowHistory]  = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [sortCol,      setSortCol]      = useState<"name" | "role">("name")

  const filtered = staff.filter((s) => {
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
    if (search && !fullName.includes(search.toLowerCase())) return false
    if (roleFilter   !== "all" && s.role              !== roleFilter)   return false
    if (statusFilter !== "all" && s.onboarding_status !== statusFilter) return false
    if (skillFilter  !== "all" && !s.staff_skills.some((sk) => sk.skill === skillFilter)) return false
    return true
  })

  const sortFn = sortCol === "name" ? sortByName : sortByRole
  const activeFiltered   = filtered.filter((s) => s.onboarding_status !== "inactive").sort(sortFn)
  const inactiveFiltered = filtered.filter((s) => s.onboarding_status === "inactive").sort(sortFn)

  // Collect all unique skill codes for the filter dropdown
  const allSkillCodes = [...new Set(staff.flatMap((s) => s.staff_skills.map((sk) => sk.skill)))].sort()

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
  const kpiActiveTecnicas = tecnicas.filter((t) => t.activa)
  const kpiAllCodes = kpiActiveTecnicas.map((t) => t.codigo)
  const kpiCoveredCount = kpiAllCodes.filter((code) =>
    kpiActiveStaff.filter((s) => s.staff_skills.some((sk) => sk.skill === code && sk.level === "certified")).length >= 2
  ).length
  const kpiFullyValidated = kpiActiveStaff.filter((s) => {
    if (s.role === "admin") return false
    const deptTecnicas = kpiActiveTecnicas.filter((t) => t.department === s.role)
    if (deptTecnicas.length === 0) return false
    const certifiedCodes = new Set(s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill))
    return deptTecnicas.every((t) => certifiedCodes.has(t.codigo))
  }).length

  return (
    <div className="flex flex-col">
      {/* KPI summary band */}
      {staff.length > 0 && (
        <div className="-mx-6 md:-mx-8 -mt-6 md:-mt-8 px-6 md:px-8 pt-6 md:pt-8 pb-5 bg-muted/40 border-b border-border mb-5">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: t("kpiActive"), value: kpiActiveStaff.length },
              { label: t("kpiTraining"), value: kpiActiveStaff.filter((s) => s.staff_skills.some((sk) => sk.level === "training")).length },
              { label: t("kpiCoverage"), value: `${kpiCoveredCount}/${kpiAllCodes.length}` },
              { label: t("kpiFullValidation"), value: kpiFullyValidated },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-border/60 bg-background px-4 py-3">
                <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</p>
                <p className="text-[22px] font-semibold text-foreground mt-0.5 leading-tight">{kpi.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content section */}
      <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-56 h-9"
          />
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value as StaffRole | "all"); clearSelection() }}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">{t("allRoles")}</option>
            <option value="lab">{t("roles.lab")}</option>
            <option value="andrology">{t("roles.andrology")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </select>
          {allSkillCodes.length > 0 && (
            <select
              value={skillFilter}
              onChange={(e) => { setSkillFilter(e.target.value); clearSelection() }}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">{t("allSkills")}</option>
              {allSkillCodes.map((code) => (
                <option key={code} value={code}>{skillLabel(code)}</option>
              ))}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as OnboardingStatus | "all"); clearSelection() }}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">{t("allStatuses")}</option>
            <option value="active">{t("onboardingStatus.active")}</option>
            <option value="onboarding">{t("onboardingStatus.onboarding")}</option>
            <option value="inactive">{t("onboardingStatus.inactive")}</option>
          </select>
        </div>
        <Button size="lg" render={<Link href="/staff/new" />}>
          <Plus className="size-4" />
          {t("addStaff")}
        </Button>
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
    </div>
  )
}
