import { useState, useCallback, useEffect } from "react"

type Storage = "local" | "session"

function getStore(storage: Storage): globalThis.Storage | null {
  if (typeof window === "undefined") return null
  return storage === "local" ? window.localStorage : window.sessionStorage
}

/**
 * useState backed by localStorage or sessionStorage.
 * Always initialises with defaultValue (SSR-safe), then hydrates from
 * storage in an effect to avoid hydration mismatches.
 */
 
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  storage: Storage = "local",
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValueState] = useState<T>(defaultValue)

  // Hydrate from storage after mount to avoid SSR/client mismatch.
  useEffect(() => {
    const store = getStore(storage)
    if (!store) return
    const stored = store.getItem(key)
    if (stored === null) return
    try { setValueState(JSON.parse(stored) as T) } catch { setValueState(stored as unknown as T) }
  }, [key, storage])

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
