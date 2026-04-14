"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export default function HrModuleError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const t = useTranslations("errors")

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <p className="text-[18px] font-medium text-foreground">
        {t("somethingWentWrong")}
      </p>
      <p className="text-[14px] text-muted-foreground max-w-md text-center">
        {error.message}
      </p>
      <Button variant="outline" onClick={reset}>
        {t("tryAgain")}
      </Button>
    </div>
  )
}
