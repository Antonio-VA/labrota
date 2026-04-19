import { useState, useCallback } from "react"

type Storage = "local" | "session"

function getStore(storage: Storage): globalThis.Storage | null {
  if (typeof window === "undefined") return null
  return storage === "local" ? window.localStorage : window.sessionStorage
}

/**
 * useState backed by localStorage or sessionStorage.
 * Returns [value, setValue, toggle] — toggle is only useful for booleans.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  storage: Storage = "local",
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValueState] = useState<T>(() => {
    const store = getStore(storage)
    if (!store) return defaultValue
    const stored = store.getItem(key)
    if (stored === null) return defaultValue
    try { return JSON.parse(stored) as T } catch { return stored as unknown as T }
  })

  const setValue = useCallback((v: T | ((prev: T) => T)) => {
    setValueState((prev) => {
      const next = typeof v === "function" ? (v as (prev: T) => T)(prev) : v
      getStore(storage)?.setItem(key, JSON.stringify(next))
      return next
    })
  }, [key, storage])

  return [value, setValue]
}

/**
 * Boolean persisted state with a stable toggle callback.
 */
export function usePersistedToggle(
  key: string,
  defaultValue: boolean,
  storage: Storage = "local",
): [boolean, () => void, (v: boolean) => void] {
  const [value, setValue] = usePersistedState(key, defaultValue, storage)

  const toggle = useCallback(() => {
    setValue((prev: boolean) => !prev)
  }, [setValue])

  return [value, toggle, setValue]
}
