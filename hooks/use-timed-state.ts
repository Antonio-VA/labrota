import { useCallback, useEffect, useRef, useState } from "react"

/**
 * State that auto-resets to `idleValue` after `delayMs`.
 *
 * Returns `[value, flash, setValue]`:
 * - `flash(v)` — set then auto-reset to idle after `delayMs`.
 * - `setValue(v)` — sticky set (no timer). Useful for error states that should persist.
 */
export function useTimedState<T>(idleValue: T, delayMs = 3000) {
  const [value, setValue] = useState<T>(idleValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const flash = useCallback((next: T) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setValue(next)
    timerRef.current = setTimeout(() => setValue(idleValue), delayMs)
  }, [idleValue, delayMs])

  return [value, flash, setValue] as const
}
