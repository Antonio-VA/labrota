"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, X, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { DropdownPanel } from "./dropdown-panel"
import { makeSkillLabel } from "./types"
import type { StaffWithSkills, OnboardingStatus, SkillName, SkillLevel, Tecnica } from "@/lib/types/database"
import {
  bulkAddSkills,
  bulkRemoveSkills,
  bulkUpdateStatus,
  bulkSoftDeleteStaff,
  hardDeleteStaff,
} from "@/app/(clinic)/staff/actions"

// ── Add skill dropdown ──────────────────────────────────────────────────────

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

  /* eslint-disable react-hooks/set-state-in-effect -- reset on close */
  useEffect(() => {
    if (!open) { setSelected(new Set()); setLevel("certified") }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

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

// ── Remove skill dropdown ───────────────────────────────────────────────────

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

  /* eslint-disable react-hooks/set-state-in-effect -- reset on close */
  useEffect(() => {
    if (!open) setSelected(new Set())
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

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

// ── Status dropdown ─────────────────────────────────────────────────────────

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

// ── Delete modal ────────────────────────────────────────────────────────────

function DeleteModal({
  open, names, onConfirm, onCancel, isPending,
}: {
  open: boolean; names: string[]; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const [confirmText, setConfirmText] = useState("")
  const confirmWord = t("deactivateModal.confirmWord")

  /* eslint-disable react-hooks/set-state-in-effect -- reset on close */
  useEffect(() => { if (!open) setConfirmText("") }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

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
          {names.map((n) => <p key={n} className="text-[13px] py-0.5">{n}</p>)}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-muted-foreground">
            {t("deactivateModal.typeToConfirm").split(confirmWord)[0]}
            <span className="font-mono font-medium text-foreground">{confirmWord}</span>
            {t("deactivateModal.typeToConfirm").split(confirmWord)[1]}
          </label>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={confirmWord} disabled={isPending} className="font-mono" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>{tc("cancel")}</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={confirmText !== confirmWord || isPending}>
            {isPending ? t("deactivateModal.deactivating") : t("deactivateModal.confirm")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Hard delete modal ───────────────────────────────────────────────────────

function HardDeleteModal({
  open, names, onConfirm, onCancel, isPending,
}: {
  open: boolean; names: string[]; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const [confirmText, setConfirmText] = useState("")
  const confirmWord = t("hardDeleteModal.confirmWord")

  /* eslint-disable react-hooks/set-state-in-effect -- reset on close */
  useEffect(() => { if (!open) setConfirmText("") }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

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
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={confirmWord} disabled={isPending} className="font-mono" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>{tc("cancel")}</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={confirmText !== confirmWord || isPending}>
            {isPending ? t("hardDeleteModal.deleting") : t("hardDeleteModal.confirm")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Bulk toolbar ────────────────────────────────────────────────────────────

export function BulkToolbar({
  selectedIds, selectedStaff, onClear, tecnicas,
}: {
  selectedIds: Set<string>
  selectedStaff: StaffWithSkills[]
  onClear: () => void
  tecnicas: Tecnica[]
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const bulkSkills = tecnicas.filter((t) => t.activa).map((t) => t.codigo)
  const bulkSkillLabel = makeSkillLabel(tecnicas)
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
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground shrink-0 whitespace-nowrap">
          <span className="inline-flex items-center justify-center size-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
            {count}
          </span>
          {count !== 1 ? "seleccionados" : "seleccionado"}
        </span>

        <div className="w-px h-5 bg-border shrink-0" />

        <div className="relative">
          <button onClick={() => { closeAll(); setAddOpen((v) => !v) }} disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap">
            {t("bulk.addSkill")} <ChevronDown className="size-3 shrink-0" />
          </button>
          <AddSkillDropdown open={addOpen} onClose={() => setAddOpen(false)} onConfirm={handleAddSkills} isPending={isPending} skills={bulkSkills} skillLabel={bulkSkillLabel} />
        </div>

        <div className="relative">
          <button onClick={() => { closeAll(); setRemoveOpen((v) => !v) }} disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap">
            {t("bulk.removeSkill")} <ChevronDown className="size-3 shrink-0" />
          </button>
          <RemoveSkillDropdown open={removeOpen} onClose={() => setRemoveOpen(false)} onConfirm={handleRemoveSkills} isPending={isPending} skills={bulkSkills} skillLabel={bulkSkillLabel} />
        </div>

        <div className="relative">
          <button onClick={() => { closeAll(); setStatusOpen((v) => !v) }} disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap">
            {t("bulk.changeStatus")} <ChevronDown className="size-3 shrink-0" />
          </button>
          <StatusDropdown open={statusOpen} onClose={() => setStatusOpen(false)} onConfirm={handleStatusChange} isPending={isPending} />
        </div>

        <div className="w-px h-5 bg-border shrink-0" />

        <button onClick={() => { closeAll(); setDeleteOpen(true) }} disabled={isPending}
          className="flex items-center gap-1 h-7 px-2 rounded-md border border-destructive/30 bg-destructive/5 text-destructive text-[12px] font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50 whitespace-nowrap">
          <Trash2 className="size-3 shrink-0" />{t("bulk.deactivate")}
        </button>

        {allInactive && (
          <button onClick={() => { closeAll(); setHardDeleteOpen(true) }} disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md bg-destructive text-destructive-foreground text-[12px] font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 whitespace-nowrap">
            <Trash2 className="size-3 shrink-0" />{t("bulk.hardDelete")}
          </button>
        )}

        <div className="w-px h-5 bg-border shrink-0" />

        <button onClick={onClear}
          className="flex items-center gap-1 h-7 px-2 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap">
          <X className="size-3 shrink-0" />{tc("cancel")}
        </button>
      </div>

      <DeleteModal open={deleteOpen} names={names} onConfirm={handleDelete} onCancel={() => setDeleteOpen(false)} isPending={isPending} />
      <HardDeleteModal open={hardDeleteOpen} names={names} onConfirm={handleHardDelete} onCancel={() => setHardDeleteOpen(false)} isPending={isPending} />
    </>
  )
}
