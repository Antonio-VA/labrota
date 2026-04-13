"use client"

import React, { useState, useEffect, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { Users, Pencil, Plus, ChevronDown, ChevronRight, Columns3, Save } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import type { StaffWithSkills, StaffRole, OnboardingStatus, Tecnica } from "@/lib/types/database"
import { bulkUpdateStaffField } from "@/app/(clinic)/staff/actions"
import { makeSkillLabel, sortByName, sortByRole, ALL_COL_ORDER, HR_KEYS, ROLE_BORDER_COLOR, type ColKey } from "./types"
import { StaffTable } from "./staff-table"
import { StaffKpis } from "./staff-kpis"
import { BulkToolbar } from "./bulk-toolbar"
import { ColumnDialog } from "./column-dialog"

export function StaffList({ staff, tecnicas = [], departments: deptsProp = [], shiftTypes = [], maxStaff = 50, leaveBalances }: {
  staff: StaffWithSkills[]
  tecnicas?: Tecnica[]
  departments?: import("@/lib/types/database").Department[]
  shiftTypes?: import("@/lib/types/database").ShiftTypeDefinition[]
  maxStaff?: number
  leaveBalances?: Record<string, { name: string; color: string; available: number; taken: number; booked: number }>
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")
  const locale = useLocale() as "es" | "en"
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get("saved") === "1") {
      toast.success(tc("savedSuccessfully"))
      router.replace("/staff", { scroll: false })
    }
  }, [searchParams, tc, router])

  const skillLabel = makeSkillLabel(tecnicas)
  const skillOrder = Object.fromEntries(tecnicas.map((t, i) => [t.codigo, i]))
  const deptBorder: Record<string, string> = { ...ROLE_BORDER_COLOR }
  const deptLabel: Record<string, string> = { lab: "Embriología", andrology: "Andrología", admin: "Admin" }
  for (const d of deptsProp) { deptBorder[d.code] = d.colour; deptLabel[d.code] = d.name }

  const [search,       setSearch]       = useState("")
  const [roleFilter,   setRoleFilter]   = useState<StaffRole | "all">("all")
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | "all">("all")
  const [skillFilter,  setSkillFilter]  = useState<string>("all")
  const [showHistory,  setShowHistory]  = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [sortCol,      setSortCol]      = useState<"name" | "role">("name")
  const [sortDir,      setSortDir]      = useState<"asc" | "desc">("asc")

  // Column visibility
  const STORAGE_KEY = "labrota_staff_columns"
  const ORDER_KEY = "labrota_staff_col_order"
  const hrActive = !!leaveBalances
  const DEFAULT_COLS: ColKey[] = hrActive
    ? ["role", "capacidades", "training", "status", "leaveBalance", "leaveTaken", "leaveBooked"]
    : ["role", "capacidades", "training", "status"]
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const savedArr = JSON.parse(saved) as ColKey[]
          const cols = new Set(savedArr)
          if (!hrActive) {
            HR_KEYS.forEach((k) => cols.delete(k))
          } else {
            HR_KEYS.forEach((k) => { if (!savedArr.includes(k)) cols.add(k) })
          }
          return cols
        }
      } catch { /* ignore */ }
    }
    return new Set(DEFAULT_COLS)
  })
  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(ORDER_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as ColKey[]
          const extra = ALL_COL_ORDER.filter((k) => !parsed.includes(k))
          return [...parsed, ...extra]
        }
      } catch { /* ignore */ }
    }
    return [...ALL_COL_ORDER]
  })
  const [showColDialog, setShowColDialog] = useState(false)
  const [draftOrder, setDraftOrder] = useState<ColKey[]>([])
  const [draftVisible, setDraftVisible] = useState<Set<ColKey>>(new Set())

  function openColDialog() {
    setDraftOrder([...colOrder])
    setDraftVisible(new Set(visibleCols))
    setShowColDialog(true)
  }

  function saveColPrefs() {
    setColOrder(draftOrder)
    setVisibleCols(draftVisible)
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(draftOrder))
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...draftVisible]))
    } catch { /* ignore */ }
    setShowColDialog(false)
  }

  const ALL_COLUMNS: { key: ColKey; label: string }[] = [
    { key: "role", label: t("columnMenu.role") },
    { key: "email", label: t("columnMenu.email") },
    { key: "capacidades", label: t("columnMenu.capacidades") },
    { key: "training", label: t("columnMenu.training") },
    { key: "status", label: t("columnMenu.status") },
    { key: "shiftPrefs", label: t("columnMenu.shiftPrefs") },
    { key: "dayPrefs", label: t("columnMenu.dayPrefs") },
    { key: "daysPerWeek", label: t("columnMenu.daysPerWeek") },
    { key: "workingPattern", label: t("columnMenu.workingPattern") },
    ...(hrActive ? [
      { key: "leaveBalance" as ColKey, label: t("columnMenu.leaveBalance") },
      { key: "leaveTaken" as ColKey, label: t("columnMenu.leaveTaken") },
      { key: "leaveBooked" as ColKey, label: t("columnMenu.leaveBooked") },
    ] : []),
  ]

  // Inline edit mode
  const [editMode, setEditMode] = useState(false)
  const [editDirty, setEditDirty] = useState<Map<string, Record<string, unknown>>>(new Map())
  const [isSaving, startSaving] = useTransition()

  function setEditValue(staffId: string, field: string, value: unknown) {
    setEditDirty((prev) => {
      const next = new Map(prev)
      const row = next.get(staffId) ?? {}
      row[field] = value
      next.set(staffId, row)
      return next
    })
  }

  async function saveEdits() {
    const updates: { id: string; field: string; value: unknown }[] = []
    for (const [staffId, fields] of editDirty) {
      for (const [field, value] of Object.entries(fields)) {
        updates.push({ id: staffId, field, value })
      }
    }
    if (updates.length === 0) { setEditMode(false); return }
    startSaving(async () => {
      const result = await bulkUpdateStaffField(updates)
      if (result.error) toast.error(result.error)
      else toast.success(t("bulk.fieldsUpdated", { count: result.updated }))
      setEditDirty(new Map())
      setEditMode(false)
    })
  }

  function getVal(s: StaffWithSkills, field: string): unknown {
    return editDirty.get(s.id)?.[field] ?? s[field as keyof StaffWithSkills]
  }

  const filtered = staff.filter((s) => {
    if (search) {
      const q = search.toLowerCase()
      const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
      const dept = (deptLabel[s.role] ?? s.role).toLowerCase()
      const skills = s.staff_skills.map((sk) => skillLabel(sk.skill).toLowerCase()).join(" ")
      const email = (s.email ?? "").toLowerCase()
      if (!fullName.includes(q) && !dept.includes(q) && !skills.includes(q) && !email.includes(q)) return false
    }
    if (roleFilter   !== "all" && s.role              !== roleFilter)   return false
    if (statusFilter !== "all" && s.onboarding_status !== statusFilter) return false
    if (skillFilter  !== "all" && !s.staff_skills.some((sk) => sk.skill === skillFilter && sk.level === "certified")) return false
    return true
  })

  const sortFn = (a: StaffWithSkills, b: StaffWithSkills) => {
    const base = sortCol === "name" ? sortByName(a, b) : sortByRole(a, b)
    return sortDir === "desc" ? -base : base
  }
  const activeFiltered   = filtered.filter((s) => s.onboarding_status !== "inactive").sort(sortFn)
  const inactiveFiltered = filtered.filter((s) => s.onboarding_status === "inactive").sort(sortFn)

  const allSkillCodes = [...new Set([
    ...tecnicas.filter((tc) => tc.activa).map((tc) => tc.codigo),
    ...staff.flatMap((s) => s.staff_skills.map((sk) => sk.skill)),
  ])].sort()

  const hasFilters = search || roleFilter !== "all" || statusFilter !== "all" || skillFilter !== "all"

  const visibleIds = [
    ...activeFiltered,
    ...(showHistory ? inactiveFiltered : []),
  ]

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(ids: string[]) {
    const allSelected = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) { ids.forEach((id) => next.delete(id)) } else { ids.forEach((id) => next.add(id)) }
      return next
    })
  }

  function clearSelection() { setSelectedIds(new Set()) }

  const visibleIdSet = new Set(visibleIds.map((s) => s.id))
  const effectiveSelectedIds = new Set([...selectedIds].filter((id) => visibleIdSet.has(id)))

  return (
    <div className="flex flex-col">
      {staff.length > 0 && (
        <StaffKpis
          staff={staff}
          tecnicas={tecnicas}
          departments={deptsProp}
          deptBorder={deptBorder}
          maxStaff={maxStaff}
          t={t as any}
        />
      )}

      <div className="flex flex-col gap-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 sticky top-0 z-20 bg-background pt-1 pb-3 -mx-6 px-6 md:-mx-8 md:px-8">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Input
              placeholder={t("searchPlaceholderGeneral")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-48 h-8 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openColDialog}
              className={cn("h-9 px-2.5 rounded-lg border text-[13px] flex items-center gap-1.5 transition-colors", visibleCols.size !== DEFAULT_COLS.length || !DEFAULT_COLS.every((c) => visibleCols.has(c)) ? "border-primary/30 text-primary bg-primary/5" : "border-input text-muted-foreground hover:text-foreground")}
            >
              <Columns3 className="size-4" />
            </button>
            {editMode ? (
              <>
                <button onClick={() => { setEditDirty(new Map()); setEditMode(false) }} className="h-9 px-3 rounded-lg border border-input text-[13px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                  {tc("cancel")}
                </button>
                <button onClick={saveEdits} disabled={isSaving} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50">
                  <Save className="size-3.5" />
                  {isSaving ? tc("saving") : tc("save")}
                </button>
              </>
            ) : (
              <button onClick={() => setEditMode(true)} className="h-9 px-2.5 rounded-lg border border-input text-[13px] text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <Pencil className="size-3.5" />
              </button>
            )}
            <Button size="lg" render={<Link href="/staff/new" />}>
              <Plus className="size-4" />
              {t("addStaff")}
            </Button>
          </div>
        </div>

        {staff.length === 0 && (
          <div className="mt-4">
            <EmptyState icon={Users} title={t("noStaff")} description={t("noStaffDescription")} action={{ label: t("addStaff"), onClick: () => router.push("/staff/new") }} />
          </div>
        )}

        {staff.length > 0 && activeFiltered.length === 0 && inactiveFiltered.length === 0 && hasFilters && (
          <div className="mt-4">
            <EmptyState icon={Users} title={t("noResults")} description={t("noResultsDescription")} />
          </div>
        )}

        {activeFiltered.length > 0 && (
          <StaffTable
            members={activeFiltered} t={t as any} ts={ts as any} muted={false}
            selectedIds={effectiveSelectedIds} onToggle={toggleOne} onToggleAll={toggleAll}
            skillLabel={skillLabel} deptBorder={deptBorder} deptLabel={deptLabel} skillOrder={skillOrder} tecnicas={tecnicas}
            sortCol={sortCol} onSortChange={setSortCol} visibleCols={visibleCols} editMode={editMode}
            getVal={getVal} setEditValue={setEditValue} shiftTypes={shiftTypes} leaveBalances={leaveBalances}
            colOrder={colOrder}
            roleFilter={roleFilter} onRoleFilterChange={(v) => { setRoleFilter(v); clearSelection() }}
            statusFilter={statusFilter} onStatusFilterChange={(v) => { setStatusFilter(v); clearSelection() }}
            skillFilter={skillFilter} onSkillFilterChange={(v) => { setSkillFilter(v); clearSelection() }}
            allSkillCodes={allSkillCodes} sortDir={sortDir} onSortWithDir={(col, dir) => { setSortCol(col); setSortDir(dir) }}
          />
        )}

        {inactiveFiltered.length > 0 && (
          <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mt-4">
            {showHistory ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {showHistory ? t("hideHistory") : t("showHistory", { count: inactiveFiltered.length })}
          </button>
        )}

        {showHistory && inactiveFiltered.length > 0 && (
          <div className="mt-4">
            <StaffTable
              members={inactiveFiltered} t={t as any} ts={ts as any} muted
              selectedIds={effectiveSelectedIds} onToggle={toggleOne} onToggleAll={toggleAll}
              skillLabel={skillLabel} deptBorder={deptBorder} deptLabel={deptLabel} skillOrder={skillOrder} tecnicas={tecnicas}
              colOrder={colOrder}
            />
          </div>
        )}

        {effectiveSelectedIds.size > 0 && (
          <BulkToolbar selectedIds={effectiveSelectedIds} selectedStaff={staff} onClear={clearSelection} tecnicas={tecnicas} />
        )}
      </div>

      <ColumnDialog
        open={showColDialog}
        onClose={() => setShowColDialog(false)}
        onSave={saveColPrefs}
        draftOrder={draftOrder}
        setDraftOrder={setDraftOrder}
        draftVisible={draftVisible}
        setDraftVisible={setDraftVisible}
        allColumns={ALL_COLUMNS}
        saveLabel={tc("save")}
        cancelLabel={tc("cancel")}
        title={locale === "es" ? "Columnas" : "Columns"}
        subtitle={locale === "es" ? "Arrastra para reordenar" : "Drag to reorder"}
      />
    </div>
  )
}
