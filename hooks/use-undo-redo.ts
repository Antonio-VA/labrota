import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"

export type UndoEntry = {
  snapshot: RotaWeekData
  forwardSnapshot?: RotaWeekData
  inverse: () => Promise<{ error?: string }>
  forward: () => Promise<{ error?: string }>
}

interface UseUndoRedoOptions {
  weekStart: string
  locale: string
  weekData: RotaWeekData | null
  setWeekData: (d: RotaWeekData) => void
  fetchWeekSilent: (ws: string) => Promise<RotaWeekData | null>
  lastFetchIdRef: React.RefObject<number>
  /** Direct setter for the active grid's localDays — bypasses full tree re-render */
  gridSetDaysRef: React.RefObject<((days: RotaDay[]) => void) | null>
}

export function useUndoRedo({ weekStart, locale, weekData, setWeekData, fetchWeekSilent, lastFetchIdRef, gridSetDaysRef }: UseUndoRedoOptions) {
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)
  const [showSaved, setShowSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function triggerSaved() {
    setShowSaved(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000)
  }

  function cancelLastUndo() {
    undoStack.current.pop()
    setUndoLen(undoStack.current.length)
  }

  function pushUndo(
    snapshot: RotaWeekData,
    inverse: () => Promise<{ error?: string }>,
    forward: () => Promise<{ error?: string }>,
  ) {
    undoStack.current = [...undoStack.current.slice(-19), { snapshot, inverse, forward }]
    redoStack.current = []
    setUndoLen(undoStack.current.length)
    setRedoLen(0)
  }

  function handleUndo() {
    const entry = undoStack.current.pop()
    if (!entry) return
    const currentData = weekData
    if (currentData) {
      redoStack.current = [...redoStack.current, { snapshot: entry.snapshot, forwardSnapshot: currentData, inverse: entry.inverse, forward: entry.forward }]
    }
    lastFetchIdRef.current++
    // 1. Direct grid update — same path as drag-and-drop, renders only the grid
    if (gridSetDaysRef.current) {
      flushSync(() => {
        gridSetDaysRef.current!(entry.snapshot.days)
      })
    }
    // 2. Update weekData for toolbar/coverage (normal batched render)
    setWeekData(entry.snapshot)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
    // 3. Fire-and-forget: persist to server
    entry.inverse().then((result) => {
      if (result?.error) toast.error(locale === "es" ? "Error al deshacer" : "Undo failed")
      fetchWeekSilent(weekStart)
    }).catch(() => {
      toast.error(locale === "es" ? "Error al deshacer" : "Undo failed")
      fetchWeekSilent(weekStart)
    })
  }

  function handleRedo() {
    const entry = redoStack.current.pop()
    if (!entry) return
    const targetSnapshot = entry.forwardSnapshot
    if (!targetSnapshot) return
    const currentData = weekData
    if (currentData) {
      undoStack.current = [...undoStack.current.slice(-19), { snapshot: currentData, forwardSnapshot: targetSnapshot, inverse: entry.inverse, forward: entry.forward }]
    }
    lastFetchIdRef.current++
    // 1. Direct grid update
    if (gridSetDaysRef.current) {
      flushSync(() => {
        gridSetDaysRef.current!(targetSnapshot.days)
      })
    }
    // 2. Update weekData for toolbar/coverage
    setWeekData(targetSnapshot)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
    // 3. Fire-and-forget: persist to server
    entry.forward().then((result) => {
      if (result?.error) toast.error(locale === "es" ? "Error al rehacer" : "Redo failed")
      fetchWeekSilent(weekStart)
    }).catch(() => {
      toast.error(locale === "es" ? "Error al rehacer" : "Redo failed")
      fetchWeekSilent(weekStart)
    })
  }

  // Clear stacks when navigating weeks — refs must reset here so state stays in sync.
  useEffect(() => {
    undoStack.current = []
    redoStack.current = []
    // eslint-disable-next-line react-hooks/set-state-in-effect -- paired with ref clear above
    setUndoLen(0)
    setRedoLen(0)
  }, [weekStart])

  // Keyboard shortcuts — Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
  const undoRedoRef = useRef({ handleUndo, handleRedo })
  useEffect(() => { undoRedoRef.current = { handleUndo, handleRedo } })
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undoRedoRef.current.handleUndo() }
      if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); undoRedoRef.current.handleRedo() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, []) // stable — uses ref for latest handlers

  return {
    undoLen,
    redoLen,
    showSaved,
    triggerSaved,
    cancelLastUndo,
    pushUndo,
    handleUndo,
    handleRedo,
  }
}
