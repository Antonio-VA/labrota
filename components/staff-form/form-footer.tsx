"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export function FormFooter<Step extends string>({
  steps, current, setCurrent, isWizard, isPending,
  confirmDelete, setConfirmDelete, isDeleting, onDelete,
}: {
  steps: Step[]
  current: Step
  setCurrent: (s: Step) => void
  isWizard: boolean
  isPending: boolean
  confirmDelete: boolean
  setConfirmDelete: (v: boolean) => void
  isDeleting: boolean
  onDelete: () => void
}) {
  const t = useTranslations("staff")
  const tc = useTranslations("common")
  const stepIndex = steps.indexOf(current)

  return (
    <div className="flex items-center justify-between gap-3">
      {isWizard ? (
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <Button type="button" variant="outline" onClick={() => setCurrent(steps[stepIndex - 1])} disabled={isPending}>
              {tc("back")}
            </Button>
          )}
          {stepIndex === 0 && (
            <Button type="button" variant="outline" disabled={isPending} render={<Link href="/staff" />}>
              {tc("cancel")}
            </Button>
          )}
          {stepIndex < steps.length - 1 ? (
            <Button type="button" onClick={() => setCurrent(steps[stepIndex + 1])} disabled={isPending}>
              {tc("next")}
            </Button>
          ) : (
            <Button type="submit" disabled={isPending}>
              {isPending ? tc("saving") : tc("create")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? tc("saving") : tc("save")}
            </Button>
            <Button type="button" variant="outline" disabled={isPending} render={<Link href="/staff" />}>
              {tc("cancel")}
            </Button>
          </div>

          {!confirmDelete && (
            <Button type="button" variant="destructive" disabled={isPending || isDeleting} onClick={() => setConfirmDelete(true)}>
              {tc("delete")}
            </Button>
          )}

          {confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-muted-foreground">{t("deleteConfirmDescription")}</span>
              <Button type="button" variant="destructive" disabled={isDeleting} onClick={onDelete}>
                {isDeleting ? "…" : tc("confirm")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                {tc("cancel")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
