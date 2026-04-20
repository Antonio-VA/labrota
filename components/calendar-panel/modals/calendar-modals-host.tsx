"use client"

import dynamic from "next/dynamic"
import { formatDate } from "@/lib/format-date"
import type { RotaWeekData, RotaMonthSummary } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { formatToolbarLabel, type GenerationStrategy } from "../utils"
import type { useCalendarModals } from "@/hooks/use-calendar-modals"

const RotaHistoryPanel = dynamic(() => import("@/components/rota-history-panel").then((m) => m.RotaHistoryPanel), { ssr: false })
const SwapRequestDialog = dynamic(() => import("@/components/swap-request-dialog").then((m) => ({ default: m.SwapRequestDialog })), { ssr: false })
const StaffProfilePanel = dynamic(() => import("./staff-profile-panel").then((m) => ({ default: m.StaffProfilePanel })), { ssr: false })
const GenerationStrategyModal = dynamic(() => import("./generation-modals").then((m) => ({ default: m.GenerationStrategyModal })), { ssr: false })
const AIReasoningModal = dynamic(() => import("./generation-modals").then((m) => ({ default: m.AIReasoningModal })), { ssr: false })
const SaveTemplateModal = dynamic(() => import("./generation-modals").then((m) => ({ default: m.SaveTemplateModal })), { ssr: false })
const ApplyTemplateModal = dynamic(() => import("./generation-modals").then((m) => ({ default: m.ApplyTemplateModal })), { ssr: false })
const MultiWeekScopeDialog = dynamic(() => import("./generation-modals").then((m) => ({ default: m.MultiWeekScopeDialog })), { ssr: false })

type Modals = ReturnType<typeof useCalendarModals>

export function CalendarModalsHost({
  modals, weekStart, currentDate, locale,
  weekData, monthSummary, staffList,
  aiReasoning, reasoningVariant,
  desktopSwapEnabled,
  onStrategyGenerate, onSelectMultiWeekScope,
  onRefreshWeek, onAfterApplyTemplate,
}: {
  modals: Modals
  weekStart: string
  currentDate: string
  locale: string
  weekData: RotaWeekData | null
  monthSummary: RotaMonthSummary | null
  staffList: StaffWithSkills[]
  aiReasoning: string
  reasoningVariant: "hybrid" | "claude"
  desktopSwapEnabled: boolean
  onStrategyGenerate: (strategy: GenerationStrategy) => void
  onSelectMultiWeekScope: (weekStarts: string[]) => void
  onRefreshWeek: () => void
  onAfterApplyTemplate: () => void
}) {
  const weekLabel = formatToolbarLabel("week", currentDate, weekStart, locale)

  return (
    <>
      {modals.showMultiWeekDialog && monthSummary && (
        <MultiWeekScopeDialog
          monthSummary={monthSummary}
          onClose={() => modals.setShowMultiWeekDialog(false)}
          onSelectScope={onSelectMultiWeekScope}
        />
      )}

      <StaffProfilePanel
        staffId={modals.profileStaffId}
        staffList={staffList}
        weekData={weekData}
        open={modals.profileOpen}
        onClose={() => modals.setProfileOpen(false)}
        onRefreshWeek={onRefreshWeek}
      />

      <RotaHistoryPanel
        open={modals.historyOpen}
        onOpenChange={modals.setHistoryOpen}
        weekStart={weekStart}
        onRestored={onRefreshWeek}
      />

      <GenerationStrategyModal
        open={modals.showStrategyModal}
        weekStart={weekStart}
        weekLabel={weekLabel}
        onClose={() => modals.setShowStrategyModal(false)}
        onGenerate={onStrategyGenerate}
        rotaDisplayMode={weekData?.rotaDisplayMode ?? "by_shift"}
        engineConfig={weekData?.engineConfig}
      />

      <AIReasoningModal
        open={modals.showReasoningModal}
        reasoning={aiReasoning}
        onClose={() => modals.setShowReasoningModal(false)}
        variant={reasoningVariant}
      />

      <SaveTemplateModal
        open={modals.saveTemplateOpen}
        weekStart={weekStart}
        onClose={() => modals.setSaveTemplateOpen(false)}
        onSaved={() => {}}
      />
      <ApplyTemplateModal
        open={modals.applyTemplateOpen}
        weekStart={weekStart}
        onClose={() => modals.setApplyTemplateOpen(false)}
        onApplied={onAfterApplyTemplate}
      />

      {desktopSwapEnabled && modals.swapAssignment && (
        <SwapRequestDialog
          open={modals.swapDialogOpen}
          onOpenChange={modals.setSwapDialogOpen}
          assignmentId={modals.swapAssignment.id}
          shiftType={modals.swapAssignment.shiftType}
          date={modals.swapAssignment.date}
          dateLabel={formatDate(modals.swapAssignment.date, locale as "es" | "en")}
          locale={locale as "es" | "en"}
          weekStart={weekStart}
        />
      )}
    </>
  )
}
