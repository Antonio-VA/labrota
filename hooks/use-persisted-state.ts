import { useState, useCallback } from "react"

type Storage = "local" | "session"

/**
 * useState backed by localStorage or sessionStorage.
 * Returns [value, setValue, toggle] — toggle is only useful for booleans.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  storage: Storage = "local",
): [T, (v: T | ((prev: T) => T)) => void] {
  const store = storage === "local" ? localStorage : sessionStorage

  const [value, setValueState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue
    const stored = store.getItem(key)
    if (stored === null) return defaultValue
    try { return JSON.parse(stored) as T } catch { return stored as unknown as T }
  })

  const setValue = useCallback((v: T | ((prev: T) => T)) => {
    setValueState((prev) => {
      const next = typeof v === "function" ? (v as (prev: T) => T)(prev) : v
      store.setItem(key, JSON.stringify(next))
      return next
    })
  }, [key, store])

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
