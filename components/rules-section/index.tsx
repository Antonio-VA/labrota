"use client"

import { useState, useTransition, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { PlusIcon, ShieldCheck, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { deleteRule, toggleRule } from "@/app/(clinic)/lab/rules-actions"
import type { RotaRule, Staff, Tecnica, ShiftTypeDefinition } from "@/lib/types/database"
import { RULE_TYPES, RULE_MODE } from "./constants"
import { RuleSheet } from "./rule-sheet"
import { RuleCard } from "./rule-card"

export function RulesSection({
  rules: initialRules,
  staff,
  tecnicas = [],
  shiftTypes = [],
  rotaDisplayMode = "by_shift",
}: {
  rules: RotaRule[]
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  tecnicas?: Pick<Tecnica, "codigo" | "nombre_es" | "nombre_en" | "activa">[]
  shiftTypes?: Pick<ShiftTypeDefinition, "code" | "name_es" | "name_en">[]
  rotaDisplayMode?: string
}) {
  const t = useTranslations("lab.rules")
  const locale = useLocale() as "es" | "en"
  const allowedTypes = useMemo(() => new Set(
    RULE_TYPES.filter((rt) => {
      const mode = RULE_MODE[rt]
      return mode === "both" || mode === rotaDisplayMode
    })
  ), [rotaDisplayMode])
  const [rules, setRules] = useState<RotaRule[]>(initialRules)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<RotaRule | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function openAdd() {
    setEditing(null)
    setSheetOpen(true)
  }

  function openEdit(rule: RotaRule) {
    setEditing(rule)
    setSheetOpen(true)
  }

  function handleToggle(rule: RotaRule) {
    const next = !rule.enabled
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: next } : r))
    startTransition(async () => {
      const result = await toggleRule(rule.id, next)
      if (result.error) {
        setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: rule.enabled } : r))
      }
    })
  }

  function handleDelete(id: string) {
    if (deletingId === id) {
      setDeletingId(null)
      setRules((prev) => prev.filter((r) => r.id !== id))
      startTransition(async () => {
        const result = await deleteRule(id)
        if (result.error) {
          // On error, server will revalidate — just clear optimistic state
        }
      })
    } else {
      setDeletingId(id)
    }
  }

  function handleSaved(rule: RotaRule) {
    if (editing) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? rule : r))
    } else {
      setRules((prev) => [...prev, rule])
    }
    setSheetOpen(false)
    setEditing(null)
  }

  const now = new Date().toISOString()
  const visibleRules = useMemo(() => rules.filter((r) => allowedTypes.has(r.type)), [rules, allowedTypes])
  const activeRules = useMemo(() => visibleRules.filter((r) => !r.expires_at || r.expires_at > now), [visibleRules, now])
  const expiredRules = useMemo(() => visibleRules.filter((r) => r.expires_at && r.expires_at <= now), [visibleRules, now])
  const [showExpired, setShowExpired] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[14px] font-medium">{t("title")}</p>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={openAdd}>
          <PlusIcon className="size-3.5 mr-1" />
          {t("add")}
        </Button>
      </div>

      {activeRules.length === 0 && expiredRules.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t("noRules")}
          description={t("noRulesDescription")}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {activeRules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              deletingId={deletingId}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
              staff={staff}
              tecnicas={tecnicas}
            />
          ))}
        </div>
      )}

      {/* Expired rules section */}
      {expiredRules.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <button
            type="button"
            onClick={() => setShowExpired((v) => !v)}
            className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <Clock className="size-3.5" />
            {t("expiredRules", { count: expiredRules.length })}
            <span className="text-[11px]">{showExpired ? "▲" : "▼"}</span>
          </button>
          {showExpired && (
            <div className="flex flex-col gap-2">
              {expiredRules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  expired
                  deletingId={deletingId}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  staff={staff}
                  tecnicas={tecnicas}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <RuleSheet
        open={sheetOpen}
        onOpenChange={(v) => { setSheetOpen(v); if (!v) setEditing(null) }}
        editing={editing}
        staff={staff}
        tecnicas={tecnicas}
        shiftTypes={shiftTypes}
        allowedTypes={allowedTypes}
        onSaved={handleSaved}
      />
    </div>
  )
}
