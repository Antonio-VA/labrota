"use client"

import React from "react"
import Link from "next/link"
import { useLocale } from "next-intl"
import { Star, Hourglass, ArrowUp, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills, StaffRole, OnboardingStatus, Tecnica } from "@/lib/types/database"
import { HeaderPopover } from "./dropdown-panel"
import { SkillOverflow } from "./skill-overflow"
import { StaffColorDot } from "./staff-color-dot"
import { buildGrid, DAY_LABELS, ALL_DAYS_TABLE, ALL_COL_ORDER, type ColKey } from "./types"

export function StaffTable({
  members, t, ts, muted,
  selectedIds, onToggle, onToggleAll, skillLabel,
  deptBorder, deptLabel, skillOrder, tecnicas,
  sortCol, onSortChange,
  visibleCols = new Set(["role", "capacidades", "training", "status"] as ColKey[]), editMode = false, getVal, setEditValue, shiftTypes = [],
  leaveBalances,
  colOrder,
  roleFilter, onRoleFilterChange,
  statusFilter, onStatusFilterChange,
  skillFilter, onSkillFilterChange,
  allSkillCodes,
  sortDir, onSortWithDir,
}: {
  members: StaffWithSkills[]
  t: (key: string, values?: Record<string, unknown>) => string
  ts: (key: string) => string
  muted: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[]) => void
  skillLabel: (code: string) => string
  deptBorder: Record<string, string>
  deptLabel: Record<string, string>
  skillOrder: Record<string, number>
  tecnicas: Tecnica[]
  sortCol?: "name" | "role"
  onSortChange?: (col: "name" | "role") => void
  visibleCols?: Set<ColKey>
  editMode?: boolean
  getVal?: (s: StaffWithSkills, field: string) => unknown
  setEditValue?: (staffId: string, field: string, value: unknown) => void
  shiftTypes?: import("@/lib/types/database").ShiftTypeDefinition[]
  leaveBalances?: Record<string, { name: string; color: string; available: number; taken: number; booked: number }>
  colOrder?: ColKey[]
  roleFilter?: StaffRole | "all"
  onRoleFilterChange?: (v: StaffRole | "all") => void
  statusFilter?: OnboardingStatus | "all"
  onStatusFilterChange?: (v: OnboardingStatus | "all") => void
  skillFilter?: string
  onSkillFilterChange?: (v: string) => void
  allSkillCodes?: string[]
  sortDir?: "asc" | "desc"
  onSortWithDir?: (col: "name" | "role", dir: "asc" | "desc") => void
}) {
  const locale = useLocale() as "es" | "en"
  const allSelected = members.length > 0 && members.every((m) => selectedIds.has(m.id))
  const someSelected = members.some((m) => selectedIds.has(m.id))
  const effectiveOrder = colOrder ?? ALL_COL_ORDER

  const headerCells: Record<ColKey, React.ReactNode> = {
    role: roleFilter !== undefined ? (
      <HeaderPopover label={t("columns.role")} active={roleFilter !== "all"}>
        {(close) => (
          <>
            {(["all", "lab", "andrology", "admin"] as const).map((v) => (
              <button key={v} onClick={() => { onRoleFilterChange?.(v); close() }}
                className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-muted/50 text-left transition-colors",
                  roleFilter === v && "text-primary font-medium")}>
                {roleFilter === v && <span className="size-1.5 rounded-full bg-primary shrink-0" />}
                {roleFilter !== v && <span className="size-1.5 shrink-0" />}
                {v === "all" ? (locale === "es" ? "Todos" : "All") : t(`roles.${v}`)}
              </button>
            ))}
          </>
        )}
      </HeaderPopover>
    ) : (
      <button onClick={() => onSortChange?.("role")} className="text-[12px] font-medium text-left text-muted-foreground hover:text-foreground transition-colors">{t("columns.role")}</button>
    ),
    email: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.email")}</span>,
    capacidades: skillFilter !== undefined && allSkillCodes !== undefined ? (
      <HeaderPopover label={t("columns.capacidades")} active={skillFilter !== "all"}>
        {(close) => (
          <>
            <button onClick={() => { onSkillFilterChange?.("all"); close() }}
              className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-muted/50 text-left transition-colors", skillFilter === "all" && "text-primary font-medium")}>
              <span className={cn("size-1.5 rounded-full shrink-0", skillFilter === "all" ? "bg-primary" : "")} />
              {locale === "es" ? "Todas" : "All"}
            </button>
            {allSkillCodes.map((code) => (
              <button key={code} onClick={() => { onSkillFilterChange?.(code); close() }}
                className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-muted/50 text-left transition-colors", skillFilter === code && "text-primary font-medium")}>
                <span className={cn("size-1.5 rounded-full shrink-0", skillFilter === code ? "bg-primary" : "")} />
                {skillLabel(code)}
              </button>
            ))}
          </>
        )}
      </HeaderPopover>
    ) : (
      <span className="text-[12px] font-medium text-muted-foreground">{t("columns.capacidades")}</span>
    ),
    training: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.training")}</span>,
    status: statusFilter !== undefined ? (
      <HeaderPopover label={t("columns.status")} active={statusFilter !== "all"}>
        {(close) => (
          <>
            {(["all", "active", "onboarding", "inactive"] as const).map((v) => (
              <button key={v} onClick={() => { onStatusFilterChange?.(v as OnboardingStatus | "all"); close() }}
                className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-muted/50 text-left transition-colors",
                  statusFilter === v && "text-primary font-medium")}>
                <span className={cn("size-1.5 rounded-full shrink-0", statusFilter === v ? "bg-primary" : "")} />
                {v === "all" ? (locale === "es" ? "Todos" : "All") : t(`onboardingStatus.${v}`)}
              </button>
            ))}
          </>
        )}
      </HeaderPopover>
    ) : (
      <span className="text-[12px] font-medium text-muted-foreground">{t("columns.status")}</span>
    ),
    shiftPrefs: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.shiftPrefs")}</span>,
    dayPrefs: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.dayPrefs")}</span>,
    daysPerWeek: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.daysPerWeek")}</span>,
    workingPattern: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.workingPattern")}</span>,
    leaveBalance: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.leaveBalance")}</span>,
    leaveTaken: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.leaveTaken")}</span>,
    leaveBooked: <span className="text-[12px] font-medium text-muted-foreground">{t("columns.leaveBooked")}</span>,
  }

  return (
    <div className={cn("rounded-lg border border-border bg-background", muted && "opacity-60")}>
      {/* Header */}
      <div className="hidden md:grid px-4 py-2 bg-muted/30 border-b border-border items-center sticky top-[52px] z-10" style={{ gridTemplateColumns: buildGrid(visibleCols, effectiveOrder) }}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
          onChange={() => onToggleAll(members.map((m) => m.id))}
          className="size-4 rounded border-border cursor-pointer accent-primary"
          aria-label={t("selectAll")}
        />
        {onSortWithDir ? (
          <HeaderPopover label={t("columns.name")} active={sortCol === "name"}>
            {(close) => (
              <>
                <button onClick={() => { onSortWithDir("name", "asc"); close() }}
                  className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-muted/50 text-left transition-colors",
                    sortCol === "name" && sortDir === "asc" && "text-primary font-medium")}>
                  <ArrowUp className="size-3 shrink-0" />
                  A → Z
                </button>
                <button onClick={() => { onSortWithDir("name", "desc"); close() }}
                  className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-muted/50 text-left transition-colors",
                    sortCol === "name" && sortDir === "desc" && "text-primary font-medium")}>
                  <ArrowDown className="size-3 shrink-0" />
                  Z → A
                </button>
              </>
            )}
          </HeaderPopover>
        ) : (
          <button onClick={() => onSortChange?.("name")} className="text-[12px] font-medium text-left text-muted-foreground hover:text-foreground transition-colors">
            {t("columns.name")} {sortCol === "name" && "↓"}
          </button>
        )}
        {effectiveOrder.filter(k => visibleCols.has(k)).map(k => (
          <React.Fragment key={k}>{headerCells[k]}</React.Fragment>
        ))}
      </div>

      {/* Rows */}
      {members.map((member, memberIdx) => {
        const skills          = member.staff_skills ?? []
        const certifiedSkills = skills.filter((sk) => sk.level === "certified")
        const trainingSkills  = skills.filter((sk) => sk.level === "training")
        const isSelected      = selectedIds.has(member.id)
        const deptCode        = member.role
        const deptTecnicas    = tecnicas.filter((tc) => tc.activa && tc.department.split(",").includes(deptCode))
        const certifiedCodes  = new Set(certifiedSkills.map((s) => s.skill))
        const allCertified    = deptTecnicas.length > 0 && deptTecnicas.every((tc) => certifiedCodes.has(tc.codigo))

        return (
          <div
            key={member.id}
            className={cn(
              "grid items-center px-4 py-1.5 min-h-[44px] border-b border-border last:border-0 transition-colors",
              isSelected ? "bg-primary/5" : memberIdx % 2 === 1 ? "bg-muted/30 hover:bg-accent" : "hover:bg-accent"
            )}
            style={{ gridTemplateColumns: buildGrid(visibleCols, effectiveOrder) }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(member.id)}
              onClick={(e) => e.stopPropagation()}
              className="size-4 rounded cursor-pointer accent-primary"
              style={{ borderColor: "var(--border)" }}
              aria-label={`Seleccionar ${member.first_name} ${member.last_name}`}
            />

            <div className="flex items-center gap-2 min-w-0 pr-2">
              {editMode && setEditValue ? (
                <StaffColorDot color={String(getVal?.(member, "color") ?? member.color ?? "#D4D4D8")} onChange={(c) => setEditValue(member.id, "color", c)} />
              ) : (
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: member.color || "#D4D4D8" }} />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  {editMode && setEditValue ? (
                    <div className="flex items-center gap-1 min-w-0">
                      <input type="text" value={String(getVal?.(member, "first_name") ?? member.first_name)} onChange={(e) => setEditValue(member.id, "first_name", e.target.value)} className="h-7 w-24 rounded border border-input bg-transparent px-1.5 text-[13px] outline-none" />
                      <input type="text" value={String(getVal?.(member, "last_name") ?? member.last_name)} onChange={(e) => setEditValue(member.id, "last_name", e.target.value)} className="h-7 w-24 rounded border border-input bg-transparent px-1.5 text-[13px] outline-none" />
                    </div>
                  ) : (
                    <Link href={`/staff/${member.id}`} className="text-[14px] font-normal truncate hover:text-primary transition-colors">
                      {member.first_name} {member.last_name}
                    </Link>
                  )}
                  {allCertified && (
                    <Tooltip>
                      <TooltipTrigger render={<Star className="size-3.5 text-amber-400 fill-amber-400 shrink-0 cursor-default" />} />
                      <TooltipContent side="right">Todas las técnicas validadas</TooltipContent>
                    </Tooltip>
                  )}
                  {member.contract_type === "part_time" && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 shrink-0">PT</span>
                  )}
                  {member.contract_type === "intern" && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 shrink-0">INT</span>
                  )}
                  {(() => {
                    const end = member.onboarding_end_date
                    const today = new Date().toISOString().split("T")[0]
                    if (end && today <= end) return (
                      <Tooltip>
                        <TooltipTrigger render={<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0 cursor-default">ONBOARDING</span>} />
                        <TooltipContent side="right">En periodo de incorporación hasta {end}</TooltipContent>
                      </Tooltip>
                    )
                    return null
                  })()}
                  {member.prefers_guardia === true && (
                    <Tooltip>
                      <TooltipTrigger render={<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 shrink-0 cursor-default">G</span>} />
                      <TooltipContent side="right">Voluntario/a de guardia de fin de semana</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>

            {effectiveOrder.filter(k => visibleCols.has(k)).map(k => {
              function cell(): React.ReactNode {
                switch (k) {
                  case "role":
                    return (
                      <div className="hidden md:flex items-center gap-1.5">
                        <span className="w-[3px] h-4 shrink-0 rounded-full" style={{ background: deptBorder[member.role] ?? "#94A3B8" }} />
                        <span className="text-[13px] text-foreground">{deptLabel[member.role] ?? member.role}</span>
                      </div>
                    )
                  case "email":
                    return (
                      <div className="hidden md:flex items-center min-w-0">
                        {editMode && setEditValue ? (
                          <input type="email" value={String(getVal?.(member, "email") ?? member.email ?? "")} onChange={(e) => setEditValue(member.id, "email", e.target.value || null)} placeholder="—" className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-[13px] outline-none" />
                        ) : (
                          <span className={cn("text-[13px] truncate", member.email ? "text-foreground" : "text-muted-foreground/40")}>{member.email ?? "—"}</span>
                        )}
                      </div>
                    )
                  case "capacidades":
                    return (
                      <div className="hidden md:flex items-center gap-1 overflow-hidden">
                        {certifiedSkills.length === 0 ? (
                          <span className="text-[13px] text-muted-foreground/40">—</span>
                        ) : (
                          <SkillOverflow skills={certifiedSkills} skillLabel={skillLabel} maxVisible={4} variant="certified" skillOrder={skillOrder} />
                        )}
                      </div>
                    )
                  case "training":
                    return (
                      <div className="hidden md:flex items-center gap-1 overflow-hidden pr-6">
                        {trainingSkills.length === 0 ? (
                          <span className="text-[13px] text-muted-foreground/40">—</span>
                        ) : (
                          <SkillOverflow skills={trainingSkills} skillLabel={skillLabel} maxVisible={3} variant="training" skillOrder={skillOrder} />
                        )}
                      </div>
                    )
                  case "status":
                    return (
                      <div className="hidden md:flex items-center">
                        {editMode && setEditValue ? (
                          <select
                            value={String(getVal?.(member, "onboarding_status") ?? member.onboarding_status)}
                            onChange={(e) => setEditValue(member.id, "onboarding_status", e.target.value)}
                            className={cn("h-7 rounded border border-input bg-transparent px-1.5 text-[12px] outline-none font-medium",
                              (getVal?.(member, "onboarding_status") ?? member.onboarding_status) === "active" ? "text-emerald-600" :
                              (getVal?.(member, "onboarding_status") ?? member.onboarding_status) === "onboarding" ? "text-amber-600" : "text-muted-foreground"
                            )}
                          >
                            <option value="active">{t("onboardingStatus.active")}</option>
                            <option value="onboarding">{t("onboardingStatus.onboarding")}</option>
                            <option value="inactive">{t("onboardingStatus.inactive")}</option>
                          </select>
                        ) : (
                          <span className={cn(
                            "text-[13px] font-medium",
                            member.onboarding_status === "active" && "text-emerald-600",
                            member.onboarding_status === "onboarding" && "text-amber-600",
                            member.onboarding_status === "inactive" && "text-muted-foreground",
                          )}>
                            {t(`onboardingStatus.${member.onboarding_status}`)}
                          </span>
                        )}
                      </div>
                    )
                  case "shiftPrefs": {
                    const rawPref = getVal?.(member, "preferred_shift") ?? member.preferred_shift
                    const prefs = (rawPref ? String(rawPref) : "").split(",").filter(Boolean)
                    const avoids = (getVal?.(member, "avoid_shifts") ?? member.avoid_shifts ?? []) as string[]
                    return (
                      <div className="hidden md:flex items-center gap-0.5 flex-wrap">
                        {editMode && setEditValue ? (
                          shiftTypes.filter((st) => st.active !== false).map((st) => {
                            const isPref = prefs.includes(st.code)
                            const isAvoid = avoids.includes(st.code)
                            return (
                              <button key={st.code} type="button" onClick={() => {
                                if (!isPref && !isAvoid) {
                                  setEditValue(member.id, "preferred_shift", [...prefs, st.code].join(","))
                                } else if (isPref) {
                                  setEditValue(member.id, "preferred_shift", prefs.filter((c) => c !== st.code).join(","))
                                  setEditValue(member.id, "avoid_shifts", [...avoids, st.code])
                                } else {
                                  setEditValue(member.id, "avoid_shifts", avoids.filter((c) => c !== st.code))
                                }
                              }} className={cn("h-5 px-1.5 rounded text-[9px] font-medium border", isPref ? "bg-[var(--pref-bg)] text-white border-[var(--pref-border)]" : isAvoid ? "bg-[var(--avoid-bg)] text-[var(--avoid-text)] border-[var(--avoid-border)]" : "border-border text-muted-foreground")}>
                                {st.code}
                              </button>
                            )
                          })
                        ) : (
                          <span className="text-[12px] text-muted-foreground">
                            {prefs.length > 0 || avoids.length > 0 ? (
                              <>
                                {prefs.map((c) => <span key={c} className="text-[var(--pref-bg)] font-medium">{c}</span>).reduce<React.ReactNode[]>((a, b, i) => i > 0 ? [...a, " ", b] : [b], [])}
                                {prefs.length > 0 && avoids.length > 0 && " · "}
                                {avoids.map((c) => <span key={c} className="text-[var(--avoid-text)]">{c}</span>).reduce<React.ReactNode[]>((a, b, i) => i > 0 ? [...a, " ", b] : [b], [])}
                              </>
                            ) : "—"}
                          </span>
                        )}
                      </div>
                    )
                  }
                  case "dayPrefs": {
                    const pDays = (getVal?.(member, "preferred_days") ?? member.preferred_days ?? []) as string[]
                    const aDays = (getVal?.(member, "avoid_days") ?? member.avoid_days ?? []) as string[]
                    return (
                      <div className="hidden md:flex items-center gap-0.5 flex-wrap">
                        {editMode && setEditValue ? (
                          ALL_DAYS_TABLE.map((d) => {
                            const isPref = pDays.includes(d)
                            const isAvoid = aDays.includes(d)
                            return (
                              <button key={d} type="button" onClick={() => {
                                if (!isPref && !isAvoid) {
                                  setEditValue(member.id, "preferred_days", [...pDays, d])
                                } else if (isPref) {
                                  setEditValue(member.id, "preferred_days", pDays.filter((x) => x !== d))
                                  setEditValue(member.id, "avoid_days", [...aDays, d])
                                } else {
                                  setEditValue(member.id, "avoid_days", aDays.filter((x) => x !== d))
                                }
                              }} className={cn("size-5 rounded text-[9px] font-medium border", isPref ? "bg-[var(--pref-bg)] text-white border-[var(--pref-border)]" : isAvoid ? "bg-[var(--avoid-bg)] text-[var(--avoid-text)] border-[var(--avoid-border)]" : "border-border text-muted-foreground")}>
                                {DAY_LABELS[d]}
                              </button>
                            )
                          })
                        ) : (
                          <span className="text-[12px] text-muted-foreground">
                            {pDays.length > 0 || aDays.length > 0 ? (
                              <>
                                {pDays.map((d) => <span key={d} className="text-[var(--pref-bg)] font-medium">{DAY_LABELS[d]}</span>).reduce<React.ReactNode[]>((a, b, i) => i > 0 ? [...a, " ", b] : [b], [])}
                                {pDays.length > 0 && aDays.length > 0 && " · "}
                                {aDays.map((d) => <span key={d} className="text-[var(--avoid-text)]">{DAY_LABELS[d]}</span>).reduce<React.ReactNode[]>((a, b, i) => i > 0 ? [...a, " ", b] : [b], [])}
                              </>
                            ) : "—"}
                          </span>
                        )}
                      </div>
                    )
                  }
                  case "daysPerWeek":
                    return (
                      <div className="hidden md:flex items-center">
                        {editMode && setEditValue ? (
                          <input type="number" min={1} max={7} value={Number(getVal?.(member, "days_per_week") ?? member.days_per_week)} onChange={(e) => setEditValue(member.id, "days_per_week", Math.min(7, Math.max(1, parseInt(e.target.value) || 5)))} className="h-7 w-12 rounded border border-input bg-transparent px-1.5 text-[12px] text-center outline-none" />
                        ) : (
                          <span className="text-[13px] text-muted-foreground">{member.days_per_week}</span>
                        )}
                      </div>
                    )
                  case "workingPattern":
                    return (
                      <div className="hidden md:flex items-center gap-0.5 flex-wrap">
                        {editMode && setEditValue ? (
                          ALL_DAYS_TABLE.map((d) => {
                            const wp = (getVal?.(member, "working_pattern") as string[] | null) ?? []
                            const active = wp.includes(d)
                            return (
                              <button key={d} type="button" onClick={() => {
                                const next = active ? wp.filter((x) => x !== d) : [...wp, d]
                                setEditValue(member.id, "working_pattern", next)
                              }} className={cn("size-5 rounded text-[9px] font-medium border", active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
                                {DAY_LABELS[d]}
                              </button>
                            )
                          })
                        ) : (
                          <span className="text-[12px] text-muted-foreground">
                            {(member.working_pattern ?? []).map((d) => DAY_LABELS[d] ?? d).join(" ") || "—"}
                          </span>
                        )}
                      </div>
                    )
                  case "leaveBalance": {
                    const b = leaveBalances?.[member.id]
                    return (
                      <div className="hidden md:flex items-center">
                        {b !== undefined ? (
                          <span className={cn("text-[13px] tabular-nums", b.available <= 0 ? "text-destructive font-medium" : "text-muted-foreground")}>{b.available}</span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </div>
                    )
                  }
                  case "leaveTaken": {
                    const b = leaveBalances?.[member.id]
                    return (
                      <div className="hidden md:flex items-center">
                        {b !== undefined ? (
                          <span className="text-[13px] tabular-nums text-muted-foreground">{b.taken}</span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </div>
                    )
                  }
                  case "leaveBooked": {
                    const b = leaveBalances?.[member.id]
                    return (
                      <div className="hidden md:flex items-center">
                        {b !== undefined ? (
                          <span className="text-[13px] tabular-nums text-muted-foreground">{b.booked}</span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </div>
                    )
                  }
                  default:
                    return null
                }
              }
              return <React.Fragment key={k}>{cell()}</React.Fragment>
            })}
          </div>
        )
      })}
    </div>
  )
}
