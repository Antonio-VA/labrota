"use client"

import { useCallback, useMemo, useState } from "react"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"

export type SwapAssignment = { id: string; shiftType: string; date: string }

export function useCalendarModals({ weekData }: { weekData: RotaWeekData | null }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDate, setSheetDate] = useState<string | null>(null)

  const [profileOpen, setProfileOpen] = useState(false)
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null)

  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [showReasoningModal, setShowReasoningModal] = useState(false)
  const [showMultiWeekDialog, setShowMultiWeekDialog] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<SwapAssignment | null>(null)

  const openSheet = useCallback((date: string) => {
    setSheetDate(date)
    setSheetOpen(true)
  }, [])

  const openProfile = useCallback((staffId: string) => {
    setProfileStaffId(staffId)
    setProfileOpen(true)
  }, [])

  const openSwap = useCallback((assignment: SwapAssignment) => {
    setSwapAssignment(assignment)
    setSwapDialogOpen(true)
  }, [])

  const sheetDay: RotaDay | null = useMemo(
    () => sheetDate ? (weekData?.days.find((d) => d.date === sheetDate) ?? null) : null,
    [sheetDate, weekData],
  )

  return {
    sheetOpen, setSheetOpen, sheetDate, sheetDay, openSheet,
    profileOpen, setProfileOpen, profileStaffId, openProfile,
    showStrategyModal, setShowStrategyModal,
    showReasoningModal, setShowReasoningModal,
    showMultiWeekDialog, setShowMultiWeekDialog,
    saveTemplateOpen, setSaveTemplateOpen,
    applyTemplateOpen, setApplyTemplateOpen,
    historyOpen, setHistoryOpen,
    swapDialogOpen, setSwapDialogOpen, swapAssignment, openSwap,
  }
}
