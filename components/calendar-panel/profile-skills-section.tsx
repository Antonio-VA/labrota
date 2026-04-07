"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Hourglass } from "lucide-react"
import { cn } from "@/lib/utils"
import { bulkAddSkill, bulkRemoveSkill } from "@/app/(clinic)/staff/actions"
import type { Tecnica } from "@/lib/types/database"

export function ProfileSkillsSection({
  staffId, staffSkills, tecnicas, skillLabel, canEdit, onChanged, dirtyRef,
}: {
  staffId: string
  staffSkills: { id: string; skill: string; level: string }[]
  tecnicas: Tecnica[]
  skillLabel: (code: string) => string
  canEdit: boolean
  onChanged?: () => void
  dirtyRef?: React.MutableRefObject<boolean>
}) {
  const t = useTranslations("schedule")
  const ts = useTranslations("skills")
  const locale = useLocale()
  const [saving, setSaving] = useState(false)

  const allSkills = useMemo(() => {
    const fromTecnicas = tecnicas
      .filter((tc) => tc.activa)
      .map((tc) => tc.codigo)
    return [...new Set(fromTecnicas)]
  }, [tecnicas])

  const initialLevels = useMemo(() => {
    const map: Record<string, "off" | "training" | "certified"> = {}
    for (const s of allSkills) map[s] = "off"
    for (const sk of staffSkills) {
      if (allSkills.includes(sk.skill)) map[sk.skill] = sk.level as "training" | "certified"
    }
    return map
  }, [allSkills, staffSkills])

  const [levels, setLevels] = useState(initialLevels)

  useEffect(() => { setLevels(initialLevels) }, [initialLevels])

  const isDirty = useMemo(() => {
    return allSkills.some((s) => levels[s] !== initialLevels[s])
  }, [allSkills, levels, initialLevels])

  useEffect(() => { if (dirtyRef) dirtyRef.current = isDirty }, [isDirty, dirtyRef])

  function cycleLevel(skill: string) {
    if (!canEdit) return
    setLevels((prev) => {
      const current = prev[skill] ?? "off"
      const next = current === "off" ? "training" : current === "training" ? "certified" : "off"
      return { ...prev, [skill]: next }
    })
  }

  async function handleSave() {
    setSaving(true)
    for (const skill of allSkills) {
      const was = initialLevels[skill]
      const now = levels[skill]
      if (was === now) continue
      if (was !== "off") {
        await bulkRemoveSkill([staffId], skill)
      }
      if (now !== "off") {
        await bulkAddSkill([staffId], skill, now)
      }
    }
    setSaving(false)
    onChanged?.()
  }

  const codeMap = useMemo(() =>
    Object.fromEntries(tecnicas.map((tc) => [tc.codigo, tc.codigo]))
  , [tecnicas])

  return (
    <div className="px-5 py-3 border-b border-border">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">{ts("title")}</p>

      {allSkills.length === 0 ? (
        <p className="text-[12px] text-muted-foreground italic">{t("noTecnicas")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allSkills.map((skill) => {
            const level = levels[skill] ?? "off"
            const code = codeMap[skill] ?? skill
            const changed = level !== initialLevels[skill]
            return (
              <button
                key={skill}
                type="button"
                disabled={saving || !canEdit}
                onClick={() => cycleLevel(skill)}
                title={canEdit ? (locale === "es"
                  ? `${skillLabel(skill)} — clic para cambiar (${level === "off" ? "desactivado" : level === "training" ? "en formación" : "certificado"})`
                  : `${skillLabel(skill)} — click to cycle (${level})`) : skillLabel(skill)}
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full border font-medium transition-colors",
                  level === "certified" && "bg-blue-50 border-blue-200 text-blue-700",
                  level === "training" && "bg-amber-50 border-amber-200 text-amber-600",
                  level === "off" && "bg-muted/50 border-border text-muted-foreground/60",
                  canEdit && "cursor-pointer hover:shadow-sm",
                  changed && "ring-1 ring-primary/30",
                  saving && "opacity-50"
                )}
              >
                {level === "training" && <Hourglass className="size-2.5 shrink-0" />}
                {code}
              </button>
            )
          })}
        </div>
      )}

      {canEdit && allSkills.length > 0 && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/70 italic">
          {locale === "es" ? "Clic para alternar: desactivado → formación → certificado" : "Click to cycle: off → training → certified"}
        </p>
      )}

      {isDirty && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
          >
            {saving ? (locale === "es" ? "Guardando…" : "Saving…") : (locale === "es" ? "Guardar cambios" : "Save changes")}
          </button>
          <button
            onClick={() => setLevels(initialLevels)}
            disabled={saving}
            className="text-[12px] font-medium text-muted-foreground hover:underline disabled:opacity-50"
          >
            {locale === "es" ? "Cancelar" : "Cancel"}
          </button>
        </div>
      )}
    </div>
  )
}
