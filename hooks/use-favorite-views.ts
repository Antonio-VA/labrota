"use client"

import { useRef, useEffect } from "react"
import { getUserPreferences } from "@/app/(clinic)/account-actions"
import { usePersistedState } from "./use-persisted-state"

// ── Types ────────────────────────────────────────────────────────────────────

export type FavoriteView = {
  view: string; calendarLayout: string; daysAsRows: boolean
  compact: boolean; colorChips: boolean; highlightEnabled: boolean
}

export type MobileFavoriteView = {
  viewMode: string; compact: boolean; deptColor: boolean
}

interface UseFavoriteViewsOptions {
  onApplyDesktop?: (fav: FavoriteView) => void
  onApplyMobile?: (fav: MobileFavoriteView) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFavoriteViews({ onApplyDesktop, onApplyMobile }: UseFavoriteViewsOptions) {
  const [favoriteView, setFavoriteView] = usePersistedState<FavoriteView | null>("labrota_favorite_view", null)
  const [mobileFavoriteView, setMobileFavoriteView] = usePersistedState<MobileFavoriteView | null>("labrota_mobile_favorite_view", null)

  // Apply desktop favorite on first mount (only if no session-stored view)
  const favAppliedRef = useRef(false)
  useEffect(() => {
    if (favAppliedRef.current || !favoriteView || !onApplyDesktop) return
    favAppliedRef.current = true
    onApplyDesktop(favoriteView)
  }, [favoriteView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply mobile favorite on first mount
  const mobileFavAppliedRef = useRef(false)
  useEffect(() => {
    if (mobileFavAppliedRef.current || !mobileFavoriteView || !onApplyMobile) return
    mobileFavAppliedRef.current = true
    onApplyMobile(mobileFavoriteView)
  }, [mobileFavoriteView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from DB when localStorage is empty (new browser)
  useEffect(() => {
    if (favoriteView && mobileFavoriteView) return
    getUserPreferences().then((prefs) => {
      if (!favoriteView && prefs.favoriteView) setFavoriteView(prefs.favoriteView as FavoriteView)
      if (!mobileFavoriteView && prefs.mobileFavoriteView) setMobileFavoriteView(prefs.mobileFavoriteView as MobileFavoriteView)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { favoriteView, setFavoriteView, mobileFavoriteView, setMobileFavoriteView }
}
