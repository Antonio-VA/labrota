"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

interface StaffDetailTabsProps {
  staffName: string
  profile: React.ReactNode
  balances: React.ReactNode | null
}

export function StaffDetailTabs({ staffName, profile, balances }: StaffDetailTabsProps) {
  const t = useTranslations("staff")
  const thr = useTranslations("hr")
  const [active, setActive] = useState<"profile" | "balances">("profile")

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar — only show when balances tab exists */}
      {balances && (
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setActive("profile")}
            className={cn(
              "px-4 py-2 text-[14px] font-medium border-b-2 -mb-px transition-colors",
              active === "profile"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t("editStaff")}
          </button>
          <button
            type="button"
            onClick={() => setActive("balances")}
            className={cn(
              "px-4 py-2 text-[14px] font-medium border-b-2 -mb-px transition-colors",
              active === "balances"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {thr("balances")}
          </button>
        </div>
      )}

      {/* Content */}
      <div className={active === "profile" ? "" : "hidden"}>{profile}</div>
      {balances && <div className={active === "balances" ? "" : "hidden"}>{balances}</div>}
    </div>
  )
}
