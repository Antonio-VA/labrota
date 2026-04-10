"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Settings, Trash2, RotateCcw, AlertTriangle } from "lucide-react"
import Link from "next/link"
import {
  installHrModule,
  removeHrModule,
  deleteAllHrData,
} from "@/app/(clinic)/settings/hr-module-actions"
import type { HrModule } from "@/lib/types/database"
import { formatDateWithYear } from "@/lib/format-date"
import { useLocale } from "next-intl"

interface HrModuleSettingsProps {
  installed: boolean
  active: boolean
  installedAt: string | null
  record: HrModule | null
}

export function HrModuleSettings({ installed, active, installedAt, record }: HrModuleSettingsProps) {
  const t = useTranslations("hr")
  const tc = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState("")

  const handleInstall = () => {
    startTransition(async () => {
      if (installed && !active) {
        // Reinstall — reactivate
        const result = await installHrModule()
        if (result.error) {
          toast.error(result.error)
        } else {
          toast.success(t("installSuccess"))
          router.refresh()
        }
      } else {
        // First install — go to wizard
        router.push("/settings/hr-wizard")
      }
    })
  }

  const handleRemove = () => {
    startTransition(async () => {
      const result = await removeHrModule()
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("removeSuccess"))
        setShowRemoveConfirm(false)
        router.refresh()
      }
    })
  }

  const handleDeleteData = () => {
    if (deleteInput !== "DELETE") return
    startTransition(async () => {
      const result = await deleteAllHrData()
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("deleteSuccess"))
        setShowDeleteConfirm(false)
        setDeleteInput("")
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-medium">{t("moduleTitle")}</h3>
            <p className="text-[14px] text-muted-foreground mt-0.5">
              {!installed && t("notInstalled")}
              {installed && active && (
                <>
                  <Badge variant="active" className="mr-2">{t("statusActive")}</Badge>
                  {installedAt && t("installedOn", { date: formatDateWithYear(installedAt, locale as "es" | "en") })}
                </>
              )}
              {installed && !active && (
                <>
                  <Badge variant="inactive" className="mr-2">{t("statusInactive")}</Badge>
                  {t("restoring")}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Not installed or inactive — show install button */}
        {(!installed || !active) && (
          <div>
            <Button onClick={handleInstall} disabled={isPending}>
              {installed && !active ? <RotateCcw className="size-4 mr-2" /> : null}
              {t("installButton")}
            </Button>
          </div>
        )}

        {/* Active — show settings link and remove button */}
        {installed && active && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" render={<Link href="/settings/hr-module" />}>
                <Settings className="size-4 mr-2" />
                {t("settingsLink")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRemoveConfirm(true)}
                disabled={isPending}
              >
                {t("removeButton")}
              </Button>
            </div>
          </div>
        )}

        {/* Remove confirmation modal */}
        {showRemoveConfirm && (
          <div className="rounded-lg border border-border bg-muted/50 p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[14px] font-medium">{t("removeConfirmTitle")}</p>
                <p className="text-[14px] text-muted-foreground mt-1">{t("removeConfirmMessage")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowRemoveConfirm(false)}>
                {tc("cancel")}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleRemove} disabled={isPending}>
                {t("removeButton")}
              </Button>
            </div>
          </div>
        )}

        {/* Delete data — only when inactive */}
        {installed && !active && (
          <div className="border-t border-border pt-4 mt-2">
            {!showDeleteConfirm ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isPending}
              >
                <Trash2 className="size-4 mr-2" />
                {t("deleteDataButton")}
              </Button>
            ) : (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3">
                <p className="text-[14px] font-medium text-destructive">{t("deleteDataTitle")}</p>
                <p className="text-[14px] text-muted-foreground">{t("deleteDataMessage")}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    placeholder={t("deleteDataConfirm")}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-[14px] w-48"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteData}
                    disabled={isPending || deleteInput !== "DELETE"}
                  >
                    {t("deleteDataButton")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteInput("") }}>
                    {tc("cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
