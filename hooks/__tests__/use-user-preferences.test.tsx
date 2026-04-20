// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { act, renderHook, cleanup } from "@testing-library/react"

// Mocks must be hoisted before the hook imports its dependencies.
const { saveUserPreferencesMock, routerRefreshMock } = vi.hoisted(() => ({
  saveUserPreferencesMock: vi.fn<(...args: unknown[]) => Promise<{ error: string | null }>>(),
  routerRefreshMock: vi.fn(),
}))

vi.mock("@/app/(clinic)/account-actions", () => ({
  saveUserPreferences: saveUserPreferencesMock,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

import {
  useUserPreferences,
  resolvePrefs,
  DEFAULT_PREFS,
  type SavablePrefs,
} from "@/hooks/use-user-preferences"

const SEED: SavablePrefs = { ...DEFAULT_PREFS }

beforeEach(() => {
  // Reset document.cookie — jsdom persists it across tests.
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim()
    if (name) document.cookie = `${name}=;path=/;max-age=0`
  })
  saveUserPreferencesMock.mockClear()
  saveUserPreferencesMock.mockResolvedValue({ error: null })
  routerRefreshMock.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  // Unmount every rendered hook so its BroadcastChannel + listeners don't
  // receive messages meant for the next test.
  cleanup()
  vi.useRealTimers()
})

describe("resolvePrefs", () => {
  it("returns DEFAULT_PREFS when given null", () => {
    expect(resolvePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(resolvePrefs(undefined)).toEqual(DEFAULT_PREFS)
  })

  it("overlays provided keys onto defaults", () => {
    expect(resolvePrefs({ theme: "dark", accentColor: "#ff0000" })).toEqual({
      ...DEFAULT_PREFS,
      theme: "dark",
      accentColor: "#ff0000",
    })
  })

  it("preserves firstDayOfWeek=0 (falsy) rather than defaulting", () => {
    // 0 is a valid value (Monday) — guard against `??` vs `||` bugs.
    expect(resolvePrefs({ firstDayOfWeek: 0 }).firstDayOfWeek).toBe(0)
  })
})

describe("useUserPreferences — update()", () => {
  it("early-returns when patch equals current (no save, no re-render)", async () => {
    const { result } = renderHook(() => useUserPreferences(SEED))
    const before = result.current.prefs

    act(() => { result.current.update({ theme: SEED.theme }) })
    await act(async () => { await vi.runAllTimersAsync() })

    expect(saveUserPreferencesMock).not.toHaveBeenCalled()
    expect(result.current.prefs).toBe(before)
  })

  it("debounces rapid updates into a single save", async () => {
    const { result } = renderHook(() => useUserPreferences(SEED))

    act(() => { result.current.update({ accentColor: "#111111" }) })
    act(() => { result.current.update({ accentColor: "#222222" }) })
    act(() => { result.current.update({ accentColor: "#333333" }) })

    // Still within debounce window
    expect(saveUserPreferencesMock).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(500) })

    expect(saveUserPreferencesMock).toHaveBeenCalledTimes(1)
    expect(saveUserPreferencesMock).toHaveBeenCalledWith(
      expect.objectContaining({ accentColor: "#333333" })
    )
  })

  it("exposes saving → saved → idle status through a debounced save", async () => {
    const { result } = renderHook(() => useUserPreferences(SEED))
    expect(result.current.status).toBe("idle")

    act(() => { result.current.update({ theme: "dark" }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })

    // Once the save promise resolves we flash "saved" and auto-revert to "idle".
    expect(result.current.status).toBe("saved")

    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(result.current.status).toBe("idle")
  })

  it("surfaces 'error' status when the server action fails", async () => {
    saveUserPreferencesMock.mockResolvedValueOnce({ error: "boom" })
    const { result } = renderHook(() => useUserPreferences(SEED))

    act(() => { result.current.update({ theme: "dark" }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })

    expect(result.current.status).toBe("error")
  })

  it("update(seed, { persist: false }) applies prefs but never saves", async () => {
    const { result } = renderHook(() => useUserPreferences(SEED))
    const newSeed: SavablePrefs = { ...SEED, theme: "dark", accentColor: "#abcdef" }

    act(() => { result.current.update(newSeed, { persist: false }) })
    await act(async () => { await vi.runAllTimersAsync() })

    expect(result.current.prefs).toEqual(newSeed)
    expect(saveUserPreferencesMock).not.toHaveBeenCalled()
  })

  it("locale change writes cookie + calls router.refresh()", async () => {
    const { result } = renderHook(() => useUserPreferences(SEED))

    act(() => { result.current.update({ locale: "en" }) })

    // Locale effects fire immediately (not debounced) — cookie write happens
    // before the save so the next navigation uses the new locale.
    expect(document.cookie).toContain("locale=en")
    expect(routerRefreshMock).toHaveBeenCalledTimes(1)
  })

  it("does not refresh the router when locale is unchanged", async () => {
    const { result } = renderHook(() => useUserPreferences(SEED))

    act(() => { result.current.update({ theme: "dark" }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })

    expect(routerRefreshMock).not.toHaveBeenCalled()
  })

  it("pagehide listener flushes a pending save immediately", async () => {
    const { result } = renderHook(() => useUserPreferences(SEED))

    act(() => { result.current.update({ theme: "dark" }) })
    // Before the debounce timer fires, simulate the tab being hidden.
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"))
      await Promise.resolve()
    })

    expect(saveUserPreferencesMock).toHaveBeenCalledTimes(1)
  })

  it("unmount cancels a pending debounce timer without double-saving", async () => {
    const { result, unmount } = renderHook(() => useUserPreferences(SEED))

    act(() => { result.current.update({ theme: "dark" }) })
    unmount()
    // The unmount cleanup flushes once immediately. Advancing past the debounce
    // window must not trigger a second save.
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(saveUserPreferencesMock).toHaveBeenCalledTimes(1)
  })
})
