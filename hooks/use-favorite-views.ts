"use client"

import { useState, useRef, useEffect } from "react"
import { getUserPreferences, saveUserPreferences } from "@/app/(clinic)/account-actions"

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
  const [favoriteView, setFavoriteView] = useState<FavoriteView | null>(() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(localStorage.getItem("labrota_favorite_view") ?? "null") } catch { return null }
  })
  const [mobileFavoriteView, setMobileFavoriteView] = useState<MobileFavoriteView | null>(() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(localStorage.getItem("labrota_mobile_favorite_view") ?? "null") } catch { return null }
  })

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
    const hasDesktop = localStorage.getItem("labrota_favorite_view")
    const hasMobile = localStorage.getItem("labrota_mobile_favorite_view")
    if (hasDesktop && hasMobile) return
    getUserPreferences().then((prefs) => {
      if (!hasDesktop && prefs.favoriteView) {
        localStorage.setItem("labrota_favorite_view", JSON.stringify(prefs.favoriteView))
        setFavoriteView(prefs.favoriteView as FavoriteView)
      }
      if (!hasMobile && prefs.mobileFavoriteView) {
        localStorage.setItem("labrota_mobile_favorite_view", JSON.stringify(prefs.mobileFavoriteView))
        setMobileFavoriteView(prefs.mobileFavoriteView as MobileFavoriteView)
      }
    })
  }, [])

  return { favoriteView, setFavoriteView, mobileFavoriteView, setMobileFavoriteView }
}
