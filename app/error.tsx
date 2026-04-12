"use client"

import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const t = useTranslations("errors")

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] gap-4 px-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
        <AlertTriangle className="w-5 h-5 text-destructive" />
      </div>
      <p className="text-[18px] font-medium text-foreground">
        {t("somethingWentWrong")}
      </p>
      <p className="text-[14px] text-muted-foreground max-w-md text-center">
        {error.message || t("serverErrorDescription")}
      </p>
      <Button variant="outline" onClick={reset}>
        {t("tryAgain")}
      </Button>
    </div>
  )
}
