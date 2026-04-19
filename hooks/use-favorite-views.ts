"use client"

import { useRef, useEffect } from "react"
import { getUserPreferences, saveUserPreferences } from "@/app/(clinic)/account-actions"
import { usePersistedState } from "./use-persisted-state"

export type FavoriteView = {
  view: string; calendarLayout: string; daysAsRows: boolean
  compact: boolean; colorChips: boolean; highlightEnabled: boolean
}

export type MobileFavoriteView = {
  viewMode: string; compact: boolean; deptColor: boolean
}

interface FavoriteConfig<T> {
  apply: (fav: T, opts: { isInitial: boolean }) => void
  capture: () => T
}

export function useFavoriteViews({ desktop, mobile, onSaved }: {
  desktop: FavoriteConfig<FavoriteView>
  mobile: FavoriteConfig<MobileFavoriteView>
  onSaved?: () => void
}) {
  const [favoriteView, setFavoriteView] = usePersistedState<FavoriteView | null>("labrota_favorite_view", null)
  const [mobileFavoriteView, setMobileFavoriteView] = usePersistedState<MobileFavoriteView | null>("labrota_mobile_favorite_view", null)

  const favAppliedRef = useRef(false)
  useEffect(() => {
    if (favAppliedRef.current || !favoriteView) return
    favAppliedRef.current = true
    desktop.apply(favoriteView, { isInitial: true })
  }, [favoriteView]) // eslint-disable-line react-hooks/exhaustive-deps

  const mobileFavAppliedRef = useRef(false)
  useEffect(() => {
    if (mobileFavAppliedRef.current || !mobileFavoriteView) return
    mobileFavAppliedRef.current = true
    mobile.apply(mobileFavoriteView, { isInitial: true })
  }, [mobileFavoriteView]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (favoriteView && mobileFavoriteView) return
    getUserPreferences().then((prefs) => {
      if (!favoriteView && prefs.favoriteView) setFavoriteView(prefs.favoriteView as FavoriteView)
      if (!mobileFavoriteView && prefs.mobileFavoriteView) setMobileFavoriteView(prefs.mobileFavoriteView as MobileFavoriteView)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveDesktop = () => {
    const fav = desktop.capture()
    setFavoriteView(fav)
    saveUserPreferences({ favoriteView: fav })
    onSaved?.()
  }
  const goToDesktop = favoriteView ? () => desktop.apply(favoriteView, { isInitial: false }) : undefined

  const saveMobile = () => {
    const fav = mobile.capture()
    setMobileFavoriteView(fav)
    saveUserPreferences({ mobileFavoriteView: fav })
    onSaved?.()
  }
  const goToMobile = mobileFavoriteView ? () => mobile.apply(mobileFavoriteView, { isInitial: false }) : undefined

  return { favoriteView, mobileFavoriteView, saveDesktop, goToDesktop, saveMobile, goToMobile }
}
