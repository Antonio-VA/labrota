"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { saveUserPreferences, type UserPreferences } from "@/app/(clinic)/account-actions"
import { applyTheme } from "@/lib/apply-theme"
import { writeLocaleCookie, type LocalePref } from "@/lib/locale-cookie"
import { PREFS_BROADCAST_CHANNEL } from "@/lib/preferences-cookies"

const SAVE_DEBOUNCE_MS = 500
const SAVED_INDICATOR_MS = 1500

export type SavablePrefs = Pick<
  UserPreferences,
  "locale" | "theme" | "accentColor" | "fontScale" | "timeFormat" | "firstDayOfWeek"
>

export type SaveStatus = "idle" | "saving" | "saved" | "error"

interface BroadcastMessage {
  prefs: SavablePrefs
  source: string
}

export const DEFAULT_PREFS: SavablePrefs = {
  locale: "browser",
  theme: "light",
  accentColor: "#1b4f8a",
  fontScale: "m",
  timeFormat: "24h",
  firstDayOfWeek: 0,
}

/** Merges a possibly-partial preferences object with DEFAULT_PREFS so callers
 *  always work with fully-populated `SavablePrefs`. */
export function resolvePrefs(p: Partial<UserPreferences> | null | undefined): SavablePrefs {
  return {
    locale: p?.locale ?? DEFAULT_PREFS.locale,
    theme: p?.theme ?? DEFAULT_PREFS.theme,
    accentColor: p?.accentColor ?? DEFAULT_PREFS.accentColor,
    fontScale: p?.fontScale ?? DEFAULT_PREFS.fontScale,
    timeFormat: p?.timeFormat ?? DEFAULT_PREFS.timeFormat,
    firstDayOfWeek: p?.firstDayOfWeek ?? DEFAULT_PREFS.firstDayOfWeek,
  }
}

/** Immediate-apply preferences state with debounced DB writes. Debounce prevents
 *  rapid slider/color changes (font scale, accent color) from spamming the server.
 *  BroadcastChannel keeps sibling tabs in sync without another server round-trip. */
export function useUserPreferences(initial: SavablePrefs) {
  const [prefs, setPrefsState] = useState<SavablePrefs>(initial)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const router = useRouter()

  const prefsRef = useRef<SavablePrefs>(initial)
  const pendingRef = useRef<SavablePrefs | null>(null)
  const hydrate = useCallback((seed: SavablePrefs) => {
    prefsRef.current = seed
    setPrefsState(seed)
    applyTheme(seed)
  }, [])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const instanceIdRef = useRef<string>("")

  const flush = useCallback(async () => {
    const toSave = pendingRef.current
    if (!toSave) return
    pendingRef.current = null
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setStatus("saving")
    const result = await saveUserPreferences(toSave)
    if (result.error) { setStatus("error"); return }
    setStatus("saved")
    bcRef.current?.postMessage({ prefs: toSave, source: instanceIdRef.current } satisfies BroadcastMessage)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setStatus("idle"), SAVED_INDICATOR_MS)
  }, [])

  const update = useCallback((patch: Partial<SavablePrefs>) => {
    const prev = prefsRef.current
    const next = { ...prev, ...patch }
    prefsRef.current = next
    pendingRef.current = next
    setPrefsState(next)

    applyTheme(next)

    if (patch.locale !== undefined && patch.locale !== prev.locale) {
      writeLocaleCookie(patch.locale as LocalePref)
      router.refresh()
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flush() }, SAVE_DEBOUNCE_MS)
  }, [flush, router])

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return
    instanceIdRef.current = `${Date.now()}-${Math.random()}`
    const bc = new BroadcastChannel(PREFS_BROADCAST_CHANNEL)
    bcRef.current = bc
    bc.onmessage = (e: MessageEvent<BroadcastMessage>) => {
      if (e.data.source === instanceIdRef.current) return
      const incoming = e.data.prefs
      const prev = prefsRef.current
      prefsRef.current = incoming
      setPrefsState(incoming)
      applyTheme(incoming)
      if (incoming.locale && incoming.locale !== prev.locale) {
        writeLocaleCookie(incoming.locale as LocalePref)
        router.refresh()
      }
    }
    return () => { bc.close(); bcRef.current = null }
  }, [router])

  useEffect(() => {
    function handleHide() { if (pendingRef.current) void flush() }
    window.addEventListener("pagehide", handleHide)
    return () => {
      window.removeEventListener("pagehide", handleHide)
      if (pendingRef.current) void flush()
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [flush])

  return { prefs, update, hydrate, status }
}
