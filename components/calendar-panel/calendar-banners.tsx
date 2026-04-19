"use client"

import { Lock } from "lucide-react"

export function CalendarBanners({
  view, isPublished, publishedAt, publishedBy, error, locale, t,
}: {
  view: "week" | "month"
  isPublished: boolean
  publishedAt: string | null
  publishedBy: string | null
  error: string | null
  locale: string
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const showPublishedBanner = isPublished && view === "week"
  if (!showPublishedBanner && !error) return null

  return (
    <div className="flex flex-col gap-2 px-4 pt-2 shrink-0">
      {showPublishedBanner && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 flex items-center gap-2">
          <Lock className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-[13px] text-emerald-700 dark:text-emerald-300">
            {publishedAt
              ? t("rotaPublishedBy", {
                  date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(publishedAt)),
                  author: publishedBy ?? "—",
                })
              : t("rotaPublished")}
          </span>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-[13px] text-destructive">{error}</span>
        </div>
      )}
    </div>
  )
}
