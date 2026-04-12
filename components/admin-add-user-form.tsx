"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { createOrgUser } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, CheckCircle2 } from "lucide-react"

export function AddUserForm({ orgId }: { orgId: string }) {
  const router = useRouter()
  const t = useTranslations("adminOrg")
  const [isPending, startTransition] = useTransition()
  const [email, setEmail]         = useState("")
  const [fullName, setFullName]   = useState("")
  const [error, setError]         = useState("")
  const [success, setSuccess]     = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setSuccess(false)

    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createOrgUser(fd)
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setEmail("")
        setFullName("")
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="orgId" value={orgId} />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[14px] text-red-600">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-[14px] text-emerald-700">
            {t("addUserInviteSent")}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <Input
            name="fullName"
            placeholder={t("addUserFullName")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isPending}
          />
          <p className="text-[11px] text-muted-foreground leading-snug">
            {t("addUserExistingHint")}
          </p>
        </div>
        <Input
          name="email"
          type="email"
          placeholder={t("addUserEmail")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isPending}
          className="flex-1"
        />
        <select
          name="appRole"
          disabled={isPending}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="admin">{t("addUserRoleAdmin")}</option>
          <option value="viewer">{t("addUserRoleViewer")}</option>
        </select>
        <Button type="submit" disabled={isPending || !email}>
          {isPending ? t("addUserSubmitting") : t("addUserSubmit")}
        </Button>
      </div>
    </form>
  )
}
