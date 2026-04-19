"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  updateOrgRegional,
  updateOrgDisplayMode,
  updateOrgBilling,
  toggleOrgLeaveRequests,
  toggleOrgTaskInShift,
  toggleOrgNotes,
  renameOrganisation,
  updateOrgEngineConfig,
  updateOrgAuthMethod,
  updateOrgMaxStaff,
} from "@/app/admin/actions"
import type { UserRow } from "@/components/admin-users-table"
import { SaveAllButton } from "./shared"
import { ImplementationSection } from "./implementation-section"
import type { ImplementationStatus } from "./implementation-section"
import { FunctionalitiesSection } from "./functionalities-section"
import { EnginesSection } from "./engines-section"
import { BillingSection } from "./billing-section"
import type { Billing } from "./billing-section"
import { ConfigurationSection } from "./configuration-section"
import { UsersSection } from "./users-section"

export function AdminOrgDetailClient({
  orgId,
  userRows,
  initialCountry,
  initialRegion,
  initialName = "",
  initialSlug = "",
  initialLogoUrl = null,
  initialDisplayMode = "by_shift",
  initialLeaveRequests = false,
  initialEnableSwapRequests = false,
  initialEnableOutlookSync = false,
  initialEnableNotes = true,
  initialEnableTaskInShift = false,
  initialAuthMethod = "password",
  initialBilling = { start: null, end: null, fee: null },
  initialAiOptimalVersion = "v2",
  initialEngineHybridEnabled = true,
  initialEngineReasoningEnabled = false,
  initialTaskOptimalVersion = "v1",
  initialTaskHybridEnabled = false,
  initialTaskReasoningEnabled = false,
  initialDailyHybridLimit = 10,
  initialAnnualLeaveDays = 20,
  initialDefaultDaysPerWeek = 5,
  initialMaxStaff = 50,
  implementationStatus,
  section = "all",
  hideUsers: _hideUsers = false,
  orgStaff = [],
}: {
  orgId: string
  userRows: UserRow[]
  initialCountry: string
  initialRegion: string
  initialName?: string
  initialSlug?: string
  initialLogoUrl?: string | null
  initialDisplayMode?: "by_shift" | "by_task"
  initialLeaveRequests?: boolean
  initialEnableSwapRequests?: boolean
  initialEnableOutlookSync?: boolean
  initialEnableNotes?: boolean
  initialEnableTaskInShift?: boolean
  initialAuthMethod?: "otp" | "password"
  initialBilling?: Billing
  initialAiOptimalVersion?: string
  initialEngineHybridEnabled?: boolean
  initialEngineReasoningEnabled?: boolean
  initialTaskOptimalVersion?: string
  initialTaskHybridEnabled?: boolean
  initialTaskReasoningEnabled?: boolean
  initialDailyHybridLimit?: number
  initialAnnualLeaveDays?: number
  initialDefaultDaysPerWeek?: number
  initialMaxStaff?: number
  implementationStatus?: ImplementationStatus
  section?: "all" | "funcionalidades" | "facturacion" | "configuracion" | "usuarios" | "implementacion"
  hideUsers?: boolean
  orgStaff?: { id: string; first_name: string; last_name: string; role: string }[]
}) {
  const t = useTranslations("adminOrg")
  const tc = useTranslations("common")
  const [isPending, startTransition] = useTransition()

  const [orgName, setOrgName] = useState(initialName)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [displayMode, setDisplayMode] = useState(initialDisplayMode)
  const [leaveRequests, setLeaveRequests] = useState(initialLeaveRequests)
  const [enableSwapRequests, setEnableSwapRequests] = useState(initialEnableSwapRequests)
  const [enableOutlookSync, setEnableOutlookSync] = useState(initialEnableOutlookSync)
  const [enableNotes, setEnableNotes] = useState(initialEnableNotes)
  const [enableTaskInShift, setEnableTaskInShift] = useState(initialEnableTaskInShift)
  const [authMethod, setAuthMethod] = useState(initialAuthMethod)
  const [aiOptimalVersion, setAiOptimalVersion] = useState(initialAiOptimalVersion)
  const [engineHybridEnabled, setEngineHybridEnabled] = useState(initialEngineHybridEnabled)
  const [engineReasoningEnabled, setEngineReasoningEnabled] = useState(initialEngineReasoningEnabled)
  const [taskOptimalVersion] = useState(initialTaskOptimalVersion)
  const [taskHybridEnabled, setTaskHybridEnabled] = useState(initialTaskHybridEnabled)
  const [taskReasoningEnabled, setTaskReasoningEnabled] = useState(initialTaskReasoningEnabled)
  const [dailyHybridLimit, setDailyHybridLimit] = useState(initialDailyHybridLimit)
  const [annualLeaveDays, setAnnualLeaveDays] = useState(initialAnnualLeaveDays)
  const [defaultDaysPerWeek, setDefaultDaysPerWeek] = useState(initialDefaultDaysPerWeek)
  const [maxStaff, setMaxStaff] = useState(initialMaxStaff)
  const [country, setCountry] = useState(initialCountry)
  const [region, setRegion] = useState(initialRegion)
  const [billing, setBilling] = useState<Billing>(initialBilling)

  function handleSaveAll() {
    if (displayMode !== initialDisplayMode) {
      if (!confirm(t("confirmDisplayMode"))) {
        setDisplayMode(initialDisplayMode)
        return
      }
    }
    startTransition(async () => {
      let hasError = false
      const report = (r?: { error?: string | null }) => {
        if (r?.error) { toast.error(r.error); hasError = true }
      }

      if (orgName.trim() && orgName !== initialName) {
        report(await renameOrganisation(orgId, orgName.trim()))
      }
      if (displayMode !== initialDisplayMode) {
        report(await updateOrgDisplayMode(orgId, displayMode))
      }
      if (leaveRequests !== initialLeaveRequests || enableNotes !== initialEnableNotes) {
        report(await toggleOrgLeaveRequests(orgId, leaveRequests))
      }
      if (enableNotes !== initialEnableNotes) {
        report(await toggleOrgNotes(orgId, enableNotes))
      }
      if (enableTaskInShift !== initialEnableTaskInShift) {
        report(await toggleOrgTaskInShift(orgId, enableTaskInShift))
      }
      report(await updateOrgRegional(orgId, country, region, annualLeaveDays, undefined, defaultDaysPerWeek))
      report(await updateOrgEngineConfig(orgId, {
        ai_optimal_version: aiOptimalVersion,
        engine_hybrid_enabled: engineHybridEnabled,
        engine_reasoning_enabled: engineReasoningEnabled,
        task_optimal_version: taskOptimalVersion,
        task_hybrid_enabled: taskHybridEnabled,
        task_reasoning_enabled: taskReasoningEnabled,
        daily_hybrid_limit: dailyHybridLimit,
      }))
      report(await updateOrgBilling(orgId, {
        billing_start: billing.start || null,
        billing_end: billing.end || null,
        billing_fee: billing.fee,
      }))
      if (authMethod !== initialAuthMethod) {
        report(await updateOrgAuthMethod(orgId, authMethod))
      }
      if (maxStaff !== initialMaxStaff) {
        report(await updateOrgMaxStaff(orgId, maxStaff))
      }
      if (!hasError) toast.success(t("configSaved"))
    })
  }

  const saveButton = (
    <SaveAllButton
      onClick={handleSaveAll}
      pending={isPending}
      savingLabel={tc("saving")}
      saveLabel={t("saveChanges")}
    />
  )

  return (
    <>
      {(section === "all" || section === "implementacion") && implementationStatus && (
        <ImplementationSection orgId={orgId} status={implementationStatus} />
      )}

      {(section === "all" || section === "funcionalidades") && (
        <>
          <FunctionalitiesSection
            orgId={orgId}
            displayMode={displayMode} setDisplayMode={setDisplayMode}
            enableNotes={enableNotes} setEnableNotes={setEnableNotes}
            enableTaskInShift={enableTaskInShift} setEnableTaskInShift={setEnableTaskInShift}
            leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests}
            enableSwapRequests={enableSwapRequests} setEnableSwapRequests={setEnableSwapRequests}
            enableOutlookSync={enableOutlookSync} setEnableOutlookSync={setEnableOutlookSync}
            disabled={isPending}
          />
          <EnginesSection
            displayMode={displayMode}
            aiOptimalVersion={aiOptimalVersion} setAiOptimalVersion={setAiOptimalVersion}
            engineHybridEnabled={engineHybridEnabled} setEngineHybridEnabled={setEngineHybridEnabled}
            engineReasoningEnabled={engineReasoningEnabled} setEngineReasoningEnabled={setEngineReasoningEnabled}
            dailyHybridLimit={dailyHybridLimit} setDailyHybridLimit={setDailyHybridLimit}
            taskHybridEnabled={taskHybridEnabled} setTaskHybridEnabled={setTaskHybridEnabled}
            taskReasoningEnabled={taskReasoningEnabled} setTaskReasoningEnabled={setTaskReasoningEnabled}
            disabled={isPending}
          />
          {saveButton}
        </>
      )}

      {(section === "all" || section === "facturacion") && (
        <>
          <BillingSection billing={billing} setBilling={setBilling} disabled={isPending} />
          {saveButton}
        </>
      )}

      {(section === "all" || section === "configuracion") && (
        <>
          <ConfigurationSection
            orgId={orgId}
            orgName={orgName} setOrgName={setOrgName}
            slug={initialSlug}
            logoUrl={logoUrl} setLogoUrl={setLogoUrl}
            country={country} setCountry={setCountry}
            region={region} setRegion={setRegion}
            annualLeaveDays={annualLeaveDays} setAnnualLeaveDays={setAnnualLeaveDays}
            defaultDaysPerWeek={defaultDaysPerWeek} setDefaultDaysPerWeek={setDefaultDaysPerWeek}
            maxStaff={maxStaff} setMaxStaff={setMaxStaff}
            authMethod={authMethod} setAuthMethod={setAuthMethod}
            disabled={isPending}
          />
          {saveButton}
        </>
      )}

      {(section === "all" || section === "usuarios") && (
        <UsersSection orgId={orgId} userRows={userRows} orgStaff={orgStaff} />
      )}
    </>
  )
}
