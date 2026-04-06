"use client"

import { useState, useTransition, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Trash2, Mail, Check } from "lucide-react"
import { toast } from "sonner"
import {
  toggleRecipient,
  addExternalRecipient,
  removeExternalRecipient,
  toggleExternalRecipient,
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
          enabled ? "bg-primary" : "bg-muted-foreground/20"
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
}: {
  initialRecipients: RecipientRow[]
}) {
  const t = useTranslations("notifications")
  const [recipients, setRecipients] = useState(initialRecipients)
  const [isPending, startTransition] = useTransition()
  const [newEmail, setNewEmail] = useState("")
  const [newName, setNewName] = useState("")

  const internalRecipients = recipients.filter((r) => !r.isExternal)
  const externalRecipients = recipients.filter((r) => r.isExternal)

  function handleToggle(r: RecipientRow) {
    const newEnabled = !r.enabled
    setRecipients((prev) => prev.map((p) =>
      (p.userId === r.userId && !r.isExternal) || (p.id === r.id && r.isExternal)
        ? { ...p, enabled: newEnabled }
        : p
    ))
    startTransition(async () => {
      const result = r.isExternal
        ? await toggleExternalRecipient(r.id!, newEnabled)
        : await toggleRecipient(r.userId!, newEnabled)
      if (result.error) {
        toast.error(result.error)
        setRecipients((prev) => prev.map((p) =>
          (p.userId === r.userId && !r.isExternal) || (p.id === r.id && r.isExternal)
            ? { ...p, enabled: !newEnabled }
            : p
        ))
      }
    })
  }

  function handleAdd() {
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      toast.error(t("invalidEmail"))
      return
    }
    startTransition(async () => {
      const result = await addExternalRecipient(email, newName.trim())
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
    })
  }

  function handleRemove(r: RecipientRow) {
    if (!r.id) return
    startTransition(async () => {
      const result = await removeExternalRecipient(r.id!)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setRecipients((prev) => prev.filter((p) => p.id !== r.id))
    })
  }

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

      {/* Internal users */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">{t("orgUsers")}</p>
        </div>
        {internalRecipients.length === 0 ? (
          <div className="px-5 py-6 text-center text-[13px] text-muted-foreground">{t("noUsers")}</div>
        ) : (
          internalRecipients.map((r, i) => {
            const hasName = r.name && r.name !== r.email
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
                  disabled={isPending}
                />
              </div>
            )
          })
        )}
      </div>

      {/* External emails */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">{t("externalEmails")}</p>
        </div>

        {externalRecipients.map((r) => {
          const hasName = r.name && r.name !== r.email
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
                disabled={isPending}
              />
              <button
                type="button"
                disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
              className="h-8 w-40 text-[13px]"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
            />
          </div>
          <Button
            size="sm"
            disabled={isPending || !newEmail.trim()}
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
