"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Users, Pencil, Plus } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills, StaffRole, OnboardingStatus, SkillName } from "@/lib/types/database"

const ROLE_VARIANTS: Record<StaffRole, "lab" | "andrology" | "admin"> = {
  lab: "lab",
  andrology: "andrology",
  admin: "admin",
}

const STATUS_VARIANTS: Record<OnboardingStatus, "active" | "inactive" | "outline"> = {
  active: "active",
  onboarding: "outline",
  inactive: "inactive",
}

const SKILL_KEYS: Record<SkillName, string> = {
  icsi: "icsi",
  iui: "iui",
  vitrification: "vitrification",
  thawing: "thawing",
  biopsy: "biopsy",
  semen_analysis: "semenAnalysis",
  sperm_prep: "spermPrep",
  witnessing: "witnessing",
  egg_collection: "eggCollection",
  other: "other",
}

function Initials({ first, last, role }: { first: string; last: string; role: StaffRole }) {
  const colors: Record<StaffRole, string> = {
    lab:       "bg-blue-100 text-blue-700",
    andrology: "bg-emerald-100 text-emerald-700",
    admin:     "bg-slate-400 text-white",
  }
  return (
    <div
      className={cn(
        "size-8 rounded-full flex items-center justify-center text-[12px] font-medium shrink-0",
        colors[role]
      )}
    >
      {first[0]?.toUpperCase()}{last[0]?.toUpperCase()}
    </div>
  )
}

export function StaffList({ staff }: { staff: StaffWithSkills[] }) {
  const t = useTranslations("staff")
  const ts = useTranslations("skills")
  const router = useRouter()

  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<StaffRole | "all">("all")
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | "all">("all")

  const filtered = staff.filter((s) => {
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
    if (search && !fullName.includes(search.toLowerCase())) return false
    if (roleFilter !== "all" && s.role !== roleFilter) return false
    if (statusFilter !== "all" && s.onboarding_status !== statusFilter) return false
    return true
  })

  const hasFilters = search || roleFilter !== "all" || statusFilter !== "all"

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar — all controls on one baseline */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-56 h-8"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as StaffRole | "all")}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">{t("allRoles")}</option>
            <option value="lab">{t("roles.lab")}</option>
            <option value="andrology">{t("roles.andrology")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OnboardingStatus | "all")}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">{t("allStatuses")}</option>
            <option value="active">{t("onboardingStatus.active")}</option>
            <option value="onboarding">{t("onboardingStatus.onboarding")}</option>
            <option value="inactive">{t("onboardingStatus.inactive")}</option>
          </select>
        </div>
        <Button render={<Link href="/staff/new" />}>
          <Plus className="size-4" />
          {t("addStaff")}
        </Button>
      </div>

      {/* Empty state — no staff at all */}
      {staff.length === 0 && (
        <EmptyState
          icon={Users}
          title={t("noStaff")}
          description={t("noStaffDescription")}
          action={{ label: t("addStaff"), onClick: () => router.push("/staff/new") }}
        />
      )}

      {/* Empty state — no results after filtering */}
      {staff.length > 0 && filtered.length === 0 && hasFilters && (
        <EmptyState
          icon={Users}
          title={t("noResults")}
          description={t("noResultsDescription")}
        />
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[28%_14%_42%_10%_6%] px-4 py-2 bg-muted/40 border-b border-border">
            <span className="text-[13px] font-medium text-muted-foreground">{t("columns.name")}</span>
            <span className="text-[13px] font-medium text-muted-foreground">{t("columns.role")}</span>
            <span className="text-[13px] font-medium text-muted-foreground">{t("columns.skills")}</span>
            <span className="text-[13px] font-medium text-muted-foreground">{t("columns.status")}</span>
            <span />
          </div>

          {/* Rows */}
          {filtered.map((member) => {
            const skills = member.staff_skills ?? []
            const visibleSkills = skills.slice(0, 4)
            const extraCount = skills.length - visibleSkills.length

            return (
              <div
                key={member.id}
                className="grid grid-cols-[1fr_auto] md:grid-cols-[28%_14%_42%_10%_6%] items-center px-4 py-2.5 min-h-[52px] border-b border-border last:border-0 hover:bg-blue-50 transition-colors"
              >
                {/* Name + avatar */}
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <Initials first={member.first_name} last={member.last_name} role={member.role} />
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium truncate">
                      {member.first_name} {member.last_name}
                    </p>
                    {member.email && (
                      <p className="text-[13px] text-muted-foreground truncate">{member.email}</p>
                    )}
                  </div>
                </div>

                {/* Role */}
                <div className="hidden md:flex items-center">
                  <Badge variant={ROLE_VARIANTS[member.role]}>
                    {t(`roles.${member.role}`)}
                  </Badge>
                </div>

                {/* Skills */}
                <div className="hidden md:flex items-center gap-1 overflow-hidden">
                  {visibleSkills.map((sk) => (
                    <Badge key={sk.skill} variant="outline" className="shrink-0">
                      {ts(SKILL_KEYS[sk.skill] as Parameters<typeof ts>[0])}
                    </Badge>
                  ))}
                  {extraCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger render={<span className="text-[12px] text-muted-foreground shrink-0 cursor-default" />}>
                        +{extraCount}
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {skills.slice(4).map((sk) => ts(SKILL_KEYS[sk.skill] as Parameters<typeof ts>[0])).join(", ")}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Status */}
                <div className="hidden md:flex items-center">
                  <Badge variant={STATUS_VARIANTS[member.onboarding_status] as "active" | "inactive" | "outline"}>
                    {t(`onboardingStatus.${member.onboarding_status}`)}
                  </Badge>
                </div>

                {/* Edit */}
                <div className="flex items-center justify-end">
                  <Link
                    href={`/staff/${member.id}`}
                    aria-label={t("editStaff")}
                    className="flex items-center justify-center size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    <Pencil className="size-4" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
