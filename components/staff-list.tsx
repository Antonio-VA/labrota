"use client"

import { useState, useRef, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Users, Pencil, Plus, X, ChevronDown, ChevronRight, Trash2, Hourglass } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills, StaffRole, OnboardingStatus, SkillName, SkillLevel } from "@/lib/types/database"
import {
  bulkAddSkill,
  bulkRemoveSkill,
  bulkUpdateStatus,
  bulkSoftDeleteStaff,
  hardDeleteStaff,
} from "@/app/(clinic)/staff/actions"

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_VARIANTS: Record<StaffRole, "lab" | "andrology" | "admin"> = {
  lab: "lab", andrology: "andrology", admin: "admin",
}

const STATUS_VARIANTS: Record<OnboardingStatus, "active" | "onboarding" | "inactive"> = {
  active: "active", onboarding: "onboarding", inactive: "inactive",
}

const SKILL_KEYS: Record<SkillName, string> = {
  icsi: "icsi", iui: "iui", vitrification: "vitrification", thawing: "thawing",
  biopsy: "biopsy", semen_analysis: "semenAnalysis", sperm_prep: "spermPrep",
  witnessing: "witnessing", egg_collection: "eggCollection", other: "other",
  embryo_transfer: "embryoTransfer", denudation: "denudation",
}

const BULK_SKILLS: SkillName[] = ["biopsy", "icsi", "egg_collection", "embryo_transfer", "denudation"]

const BULK_SKILL_LABELS: Record<string, string> = {
  biopsy:          "Biopsia",
  icsi:            "ICSI",
  egg_collection:  "Recogida de óvulos",
  embryo_transfer: "Transferencia embrionaria",
  denudation:      "Denudación",
}

const ROLE_ORDER: Record<StaffRole, number> = { lab: 0, andrology: 1, admin: 2 }
function sortByRole(a: StaffWithSkills, b: StaffWithSkills) {
  return ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_DOT: Record<StaffRole, string> = {
  lab:       "bg-blue-400",
  andrology: "bg-emerald-400",
  admin:     "bg-slate-400",
}

function RoleDot({ role }: { role: StaffRole }) {
  return (
    <span className={cn("size-2 rounded-full shrink-0", ROLE_DOT[role])} />
  )
}

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
  open, onClose, onConfirm, isPending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (skill: SkillName, level: SkillLevel) => void
  isPending: boolean
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")
  const [skill, setSkill] = useState<SkillName | null>(null)
  const [level, setLevel] = useState<SkillLevel>("certified")

  useEffect(() => {
    if (!open) { setSkill(null); setLevel("certified") }
  }, [open])

  return (
    <DropdownPanel open={open} onClose={onClose} className="w-[240px]">
      <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("dropdowns.addSkillTitle")}</p>
      <div className="flex flex-col gap-1 mb-3">
        {BULK_SKILLS.map((s) => (
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
            {ts(SKILL_KEYS[s] as Parameters<typeof ts>[0])}
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
  open, onClose, onConfirm, isPending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (skill: SkillName) => void
  isPending: boolean
}) {
  const t  = useTranslations("staff")
  const ts = useTranslations("skills")
  return (
    <DropdownPanel open={open} onClose={onClose} className="w-[220px]">
      <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("dropdowns.removeSkillTitle")}</p>
      <div className="flex flex-col gap-1">
        {BULK_SKILLS.map((s) => (
          <button
            key={s}
            disabled={isPending}
            onClick={() => onConfirm(s)}
            className="text-left text-[13px] px-2.5 py-1.5 rounded-lg border border-transparent hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive transition-colors"
          >
            {ts(SKILL_KEYS[s] as Parameters<typeof ts>[0])}
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
}: {
  selectedIds: Set<string>
  selectedStaff: StaffWithSkills[]
  onClear: () => void
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
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
      const skippedMsg = result.skipped > 0 ? ` ${result.skipped} ya la tenían.` : ""
      toast.success(`Habilidad añadida a ${result.added} miembro${result.added !== 1 ? "s" : ""}.${skippedMsg}`)
      onClear()
    })
  }

  function handleRemoveSkill(skill: SkillName) {
    setRemoveOpen(false)
    startTransition(async () => {
      const result = await bulkRemoveSkill(ids, skill)
      if (result.error) { toast.error(result.error); return }
      toast.success(`Habilidad eliminada de ${result.removed} miembro${result.removed !== 1 ? "s" : ""}.`)
      onClear()
    })
  }

  function handleStatusChange(status: OnboardingStatus) {
    setStatusOpen(false)
    startTransition(async () => {
      const result = await bulkUpdateStatus(ids, status)
      if (result.error) { toast.error(result.error); return }
      toast.success(`Estado actualizado para ${result.updated} miembro${result.updated !== 1 ? "s" : ""}.`)
      onClear()
    })
  }

  function handleDelete() {
    setDeleteOpen(false)
    startTransition(async () => {
      const result = await bulkSoftDeleteStaff(ids)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${result.deleted} miembro${result.deleted !== 1 ? "s" : ""} desactivado${result.deleted !== 1 ? "s" : ""}.`)
      onClear()
    })
  }

  function handleHardDelete() {
    setHardDeleteOpen(false)
    startTransition(async () => {
      const result = await hardDeleteStaff(ids)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${result.deleted} miembro${result.deleted !== 1 ? "s" : ""} borrado${result.deleted !== 1 ? "s" : ""} definitivamente.`)
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

// ── Staff table ────────────────────────────────────────────────────────────────

const GRID = "grid-cols-[32px_minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,4fr)_minmax(0,1.2fr)_40px]"

function StaffTable({
  members, t, ts, muted,
  selectedIds, onToggle, onToggleAll,
}: {
  members: StaffWithSkills[]
  t: ReturnType<typeof useTranslations<"staff">>
  ts: ReturnType<typeof useTranslations<"skills">>
  muted: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[]) => void
}) {
  const allSelected = members.length > 0 && members.every((m) => selectedIds.has(m.id))
  const someSelected = members.some((m) => selectedIds.has(m.id))

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden bg-white", muted && "opacity-60")}>
      {/* Header */}
      <div className={cn("hidden md:grid px-4 py-2 bg-white border-b border-border items-center", GRID)}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
          onChange={() => onToggleAll(members.map((m) => m.id))}
          className="size-4 rounded border-border cursor-pointer accent-primary"
          aria-label="Seleccionar todos"
        />
        <span className="text-[13px] font-medium text-muted-foreground">{t("columns.name")}</span>
        <span className="text-[13px] font-medium text-muted-foreground">{t("columns.role")}</span>
        <span className="text-[13px] font-medium text-muted-foreground">{t("columns.skills")}</span>
        <span className="text-[13px] font-medium text-muted-foreground">{t("columns.status")}</span>
        <span />
      </div>

      {/* Rows */}
      {members.map((member) => {
        const skills       = member.staff_skills ?? []
        const visibleSkills = skills.slice(0, 4)
        const extraCount   = skills.length - visibleSkills.length
        const isSelected   = selectedIds.has(member.id)

        return (
          <div
            key={member.id}
            className={cn(
              "grid items-center px-4 py-2.5 min-h-[52px] border-b border-border last:border-0 transition-colors",
              "grid-cols-[32px_1fr_auto] md:grid-cols-[32px_minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,4fr)_minmax(0,1.2fr)_40px]",
              isSelected ? "bg-primary/5" : "hover:bg-blue-50"
            )}
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(member.id)}
              onClick={(e) => e.stopPropagation()}
              className="size-4 rounded border-border cursor-pointer accent-primary"
              aria-label={`Seleccionar ${member.first_name} ${member.last_name}`}
            />

            {/* Name + avatar */}
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <RoleDot role={member.role} />
              <div className="min-w-0">
                <p className="text-[14px] font-medium truncate">
                  {member.first_name} {member.last_name}
                </p>
                {member.email && (
                  <p className="text-[13px] text-muted-foreground truncate">{member.email}</p>
                )}
              </div>
            </div>

            {/* Role */}
            <div className="hidden md:flex items-center">
              <Badge variant={ROLE_VARIANTS[member.role]}>
                {t(`roles.${member.role}`)}
              </Badge>
            </div>

            {/* Skills */}
            <div className="hidden md:flex items-center gap-1 overflow-hidden">
              {visibleSkills.map((sk) => (
                <span
                  key={sk.skill}
                  className={cn(
                    "shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
                    sk.level === "training"
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-blue-400 bg-blue-50 text-blue-700"
                  )}
                >
                  {ts(SKILL_KEYS[sk.skill] as Parameters<typeof ts>[0])}
                </span>
              ))}
              {extraCount > 0 && (
                <Tooltip>
                  <TooltipTrigger render={<span className="text-[12px] text-muted-foreground shrink-0 cursor-default" />}>
                    +{extraCount}
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {skills.slice(4).map((sk) => ts(SKILL_KEYS[sk.skill] as Parameters<typeof ts>[0])).join(", ")}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Status */}
            <div className="hidden md:flex items-center gap-1.5">
              <Badge variant={STATUS_VARIANTS[member.onboarding_status]}>
                {member.onboarding_status === "onboarding" && (
                  <Hourglass className="size-3 mr-1 inline-block" />
                )}
                {t(`onboardingStatus.${member.onboarding_status}`)}
              </Badge>
            </div>

            {/* Edit */}
            <div className="flex items-center justify-end">
              <Link
                href={`/staff/${member.id}`}
                aria-label={t("editStaff")}
                className="flex items-center justify-center size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-blue-50 hover:text-blue-600 transition-colors"
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

export function StaffList({ staff }: { staff: StaffWithSkills[] }) {
  const t  = useTranslations("staff")
  const ts = useTranslations("skills")
  const router = useRouter()

  const [search,       setSearch]       = useState("")
  const [roleFilter,   setRoleFilter]   = useState<StaffRole | "all">("all")
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | "all">("all")
  const [showHistory,  setShowHistory]  = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())

  const filtered = staff.filter((s) => {
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
    if (search && !fullName.includes(search.toLowerCase())) return false
    if (roleFilter   !== "all" && s.role              !== roleFilter)   return false
    if (statusFilter !== "all" && s.onboarding_status !== statusFilter) return false
    return true
  })

  const activeFiltered   = filtered.filter((s) => s.onboarding_status !== "inactive").sort(sortByRole)
  const inactiveFiltered = filtered.filter((s) => s.onboarding_status === "inactive").sort(sortByRole)

  const hasFilters = search || roleFilter !== "all" || statusFilter !== "all"

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

  return (
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
        />
      )}

      {/* Bulk toolbar */}
      {effectiveSelectedIds.size > 0 && (
        <BulkToolbar
          selectedIds={effectiveSelectedIds}
          selectedStaff={staff}
          onClear={clearSelection}
        />
      )}
    </div>
  )
}
