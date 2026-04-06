"use client"

import { useState, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Trash2, Mail, Check } from "lucide-react"
import { toast } from "sonner"
import { LayoutList, Users } from "lucide-react"
import {
  toggleRecipient,
  addExternalRecipient,
  removeExternalRecipient,
  toggleExternalRecipient,
  updateRotaEmailFormat,
  type RecipientRow,
} from "@/app/(clinic)/notifications-actions"

function ToggleSwitch({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled: boolean }) {
  const [showCheck, setShowCheck] = useState(false)

  const handleClick = useCallback(() => {
    onToggle()
    setShowCheck(true)
    setTimeout(() => setShowCheck(false), 1500)
  }, [onToggle])

  return (
    <div className="flex items-center gap-2">
      {showCheck && (
        <Check className="size-3.5 text-emerald-500 animate-in fade-in duration-200" />
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          enabled ? "bg-primary" : "bg-muted-foreground/20",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className={cn(
          "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-5" : "translate-x-0"
        )} />
      </button>
    </div>
  )
}

export function SettingsNotifications({
  initialRecipients,
  initialEmailFormat = "by_shift",
}: {
  initialRecipients: RecipientRow[]
  initialEmailFormat?: "by_shift" | "by_person"
}) {
  const t = useTranslations("notifications")
  const [recipients, setRecipients] = useState(initialRecipients)
  const [emailFormat, setEmailFormat] = useState(initialEmailFormat)
  const [savingFormat, setSavingFormat] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newName, setNewName] = useState("")
  const [addingEmail, setAddingEmail] = useState(false)
  // Track which recipients are currently being toggled (by key)
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set())
  // Track which recipients are being removed
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

  const internalRecipients = recipients.filter((r) => !r.isExternal)
  const externalRecipients = recipients.filter((r) => r.isExternal)

  function recipientKey(r: RecipientRow) {
    return r.isExternal ? `ext:${r.id}` : `int:${r.userId}`
  }

  function handleToggle(r: RecipientRow) {
    const key = recipientKey(r)
    const newEnabled = !r.enabled

    // Optimistic update
    setRecipients((prev) => prev.map((p) =>
      (p.userId === r.userId && !r.isExternal) || (p.id === r.id && r.isExternal)
        ? { ...p, enabled: newEnabled }
        : p
    ))

    // Fire server call without blocking other toggles
    setPendingKeys((prev) => new Set(prev).add(key))
    const promise = r.isExternal
      ? toggleExternalRecipient(r.id!, newEnabled)
      : toggleRecipient(r.userId!, newEnabled)

    promise.then((result) => {
      if (result.error) {
        toast.error(result.error)
        // Rollback
        setRecipients((prev) => prev.map((p) =>
          (p.userId === r.userId && !r.isExternal) || (p.id === r.id && r.isExternal)
            ? { ...p, enabled: !newEnabled }
            : p
        ))
      }
    }).finally(() => {
      setPendingKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    })
  }

  function handleBulkToggle(group: "internal" | "external", enable: boolean) {
    const targets = group === "internal" ? internalRecipients : externalRecipients
    const toToggle = targets.filter((r) => r.enabled !== enable)
    if (toToggle.length === 0) return

    for (const r of toToggle) {
      handleToggle(r)
    }
  }

  function handleAdd() {
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      toast.error(t("invalidEmail"))
      return
    }
    setAddingEmail(true)
    addExternalRecipient(email, newName.trim()).then((result) => {
      if (result.error) {
        toast.error(result.error)
        return
      }
      setRecipients((prev) => [...prev, {
        id: crypto.randomUUID(),
        userId: null,
        email,
        name: newName.trim() || email,
        enabled: true,
        isExternal: true,
      }])
      setNewEmail("")
      setNewName("")
      toast.success(t("emailAdded"))
    }).finally(() => setAddingEmail(false))
  }

  function handleRemove(r: RecipientRow) {
    if (!r.id) return
    setRemovingIds((prev) => new Set(prev).add(r.id!))
    removeExternalRecipient(r.id).then((result) => {
      if (result.error) {
        toast.error(result.error)
        return
      }
      setRecipients((prev) => prev.filter((p) => p.id !== r.id))
    }).finally(() => {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(r.id!)
        return next
      })
    })
  }

  const allInternalEnabled = internalRecipients.length > 0 && internalRecipients.every((r) => r.enabled)
  const allExternalEnabled = externalRecipients.length > 0 && externalRecipients.every((r) => r.enabled)

  return (
    <div className="flex flex-col gap-6">
      {/* Description */}
      <div className="rounded-lg border border-border bg-background px-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="size-4 text-primary" />
          <p className="text-[14px] font-medium">{t("title")}</p>
        </div>
        <p className="text-[13px] text-muted-foreground">{t("description")}</p>
      </div>

      {/* Email format */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">{t("emailFormat")}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[12px] text-muted-foreground mb-3">{t("emailFormatDesc")}</p>
          <div className="flex gap-3">
            {(["by_shift", "by_person"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                disabled={savingFormat}
                onClick={() => {
                  if (fmt === emailFormat) return
                  setEmailFormat(fmt)
                  setSavingFormat(true)
                  updateRotaEmailFormat(fmt)
                    .then((r) => { if (r.error) { toast.error(r.error); setEmailFormat(emailFormat) } })
                    .finally(() => setSavingFormat(false))
                }}
                className={cn(
                  "flex-1 flex items-center gap-2.5 rounded-lg border px-4 py-3 transition-colors text-left",
                  emailFormat === fmt
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-muted-foreground/30",
                  savingFormat && "opacity-50 cursor-not-allowed"
                )}
              >
                {fmt === "by_shift"
                  ? <LayoutList className="size-4 text-primary shrink-0" />
                  : <Users className="size-4 text-primary shrink-0" />
                }
                <div>
                  <p className={cn("text-[13px] font-medium", emailFormat === fmt && "text-primary")}>{t(fmt === "by_shift" ? "byShift" : "byPerson")}</p>
                  <p className="text-[11px] text-muted-foreground">{t(fmt === "by_shift" ? "byShiftDesc" : "byPersonDesc")}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Internal users */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">{t("orgUsers")}</p>
          {internalRecipients.length > 0 && (
            <button
              type="button"
              onClick={() => handleBulkToggle("internal", !allInternalEnabled)}
              className="text-[12px] text-primary hover:text-primary/80 font-medium transition-colors"
            >
              {allInternalEnabled ? t("disableAll") : t("enableAll")}
            </button>
          )}
        </div>
        {internalRecipients.length === 0 ? (
          <div className="px-5 py-6 text-center text-[13px] text-muted-foreground">{t("noUsers")}</div>
        ) : (
          internalRecipients.map((r, i) => {
            const hasName = r.name && r.name !== r.email
            const key = recipientKey(r)
            return (
              <div
                key={r.userId}
                className={cn(
                  "px-5 py-3 flex items-center gap-3",
                  i < internalRecipients.length - 1 && "border-b border-border/50"
                )}
              >
                <div className="flex-1 min-w-0">
                  {hasName ? (
                    <>
                      <p className="text-[13px] font-medium truncate">{r.name}</p>
                      <p className="text-[12px] text-muted-foreground truncate">{r.email}</p>
                    </>
                  ) : (
                    <p className="text-[13px] font-medium truncate">{r.email}</p>
                  )}
                </div>
                <ToggleSwitch
                  enabled={r.enabled}
                  onToggle={() => handleToggle(r)}
                  disabled={pendingKeys.has(key)}
                />
              </div>
            )
          })
        )}
      </div>

      {/* External emails */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">{t("externalEmails")}</p>
          {externalRecipients.length > 0 && (
            <button
              type="button"
              onClick={() => handleBulkToggle("external", !allExternalEnabled)}
              className="text-[12px] text-primary hover:text-primary/80 font-medium transition-colors"
            >
              {allExternalEnabled ? t("disableAll") : t("enableAll")}
            </button>
          )}
        </div>

        {externalRecipients.map((r) => {
          const hasName = r.name && r.name !== r.email
          const key = recipientKey(r)
          return (
            <div
              key={r.id}
              className="px-5 py-3 flex items-center gap-3 border-b border-border/50"
            >
              <div className="flex-1 min-w-0">
                {hasName ? (
                  <>
                    <p className="text-[13px] font-medium truncate">{r.name}</p>
                    <p className="text-[12px] text-muted-foreground truncate">{r.email}</p>
                  </>
                ) : (
                  <p className="text-[13px] font-medium truncate">{r.email}</p>
                )}
              </div>
              <ToggleSwitch
                enabled={r.enabled}
                onToggle={() => handleToggle(r)}
                disabled={pendingKeys.has(key)}
              />
              <button
                type="button"
                disabled={removingIds.has(r.id!)}
                onClick={() => handleRemove(r)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        })}

        {/* Add form */}
        <div className="px-5 py-3 flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-muted-foreground font-medium">{t("emailLabel")}</label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              disabled={addingEmail}
              className="h-8 w-56 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-muted-foreground font-medium">{t("fullNameLabel")}</label>
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("namePlaceholder")}
              disabled={addingEmail}
              className="h-8 w-40 text-[13px]"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
            />
          </div>
          <Button
            size="sm"
            disabled={addingEmail || !newEmail.trim()}
            onClick={handleAdd}
            className="h-8"
          >
            <Plus className="size-3.5" />
            {t("addButton")}
          </Button>
        </div>
      </div>
    </div>
  )
}
