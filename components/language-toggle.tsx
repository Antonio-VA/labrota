"use client"

import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { setLocale } from "@/lib/locale-action"
import { saveUserPreferences } from "@/app/(clinic)/account-actions"
import { Button } from "@/components/ui/button"

export function LanguageToggle() {
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = locale === "es" ? "en" : "es"
    startTransition(async () => {
      await setLocale(next)
      saveUserPreferences({ locale: next }) // persist to DB (fire & forget)
      router.refresh()
    })
  }

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={toggle}
      disabled={isPending}
      className="text-muted-foreground font-medium tracking-wide"
      title={locale === "es" ? "Switch to English" : "Cambiar a Español"}
    >
      {locale === "es" ? "EN" : "ES"}
    </Button>
  )
}
