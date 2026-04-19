"use client"

import { useTranslations } from "next-intl"
import { Hourglass } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StaffFormState } from "@/hooks/use-staff-form-state"
import { Section } from "./form-primitives"

export function TabTasks({ form, isPending }: { form: StaffFormState; isPending: boolean }) {
  const t = useTranslations("staff")
  const { capacidades, skillLevels, cycleSkill } = form

  return (
    <Section label={t("sections.capabilities")}>
      <div className="grid grid-cols-2 gap-2">
        {capacidades.map(({ skill, label }) => {
          const level = skillLevels[skill] ?? "off"
          return (
            <button
              key={skill}
              type="button"
              onClick={() => cycleSkill(skill)}
              disabled={isPending}
              className={cn(
                "flex items-center justify-between h-14 px-3 rounded-lg border text-left transition-colors disabled:opacity-50",
                level === "certified" && "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700",
                level === "training"  && "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700",
                level === "off"       && "bg-background border-border hover:bg-muted"
              )}
            >
              <div className="flex flex-col justify-center min-w-0">
                <span className={cn(
                  "text-[13px] font-medium leading-tight truncate",
                  level === "certified" && "text-blue-700 dark:text-blue-300",
                  level === "training"  && "text-amber-700 dark:text-amber-300",
                  level === "off"       && "text-slate-400 dark:text-slate-500"
                )}>
                  {label}
                </span>
                {level !== "off" && (
                  <span className={cn(
                    "text-[10px] leading-tight mt-0.5",
                    level === "certified" && "text-blue-600 dark:text-blue-400",
                    level === "training"  && "text-amber-600 dark:text-amber-400"
                  )}>
                    {level === "certified" ? t("skillLevels.certified") : t("skillLevels.training")}
                  </span>
                )}
              </div>
              {level === "certified" && (
                <span className="text-blue-600 dark:text-blue-400 text-[14px] leading-none ml-2 shrink-0">✓</span>
              )}
              {level === "training" && (
                <Hourglass className="size-4 text-amber-500 ml-2 shrink-0" />
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground/70 italic mt-2">
        {t("skillCycleHint")}
      </p>
      {capacidades.map(({ skill }) =>
        skillLevels[skill] && skillLevels[skill] !== "off" ? (
          <input key={skill} type="hidden" name={`skill_${skill}`} value={skillLevels[skill]} />
        ) : null
      )}
    </Section>
  )
}
