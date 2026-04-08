import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"

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
  fetchWeekSilent: (ws: string) => void
  lastFetchId: React.RefObject<number>
}

export function useUndoRedo({ weekStart, locale, weekData, setWeekData, fetchWeekSilent, lastFetchId }: UseUndoRedoOptions) {
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

  async function handleUndo() {
    const entry = undoStack.current.pop()
    if (!entry) return
    const currentData = weekData
    if (currentData) {
      redoStack.current = [...redoStack.current, { snapshot: entry.snapshot, forwardSnapshot: currentData, inverse: entry.inverse, forward: entry.forward }]
      setRedoLen(redoStack.current.length)
    }
    lastFetchId.current++
    setWeekData(entry.snapshot)
    setUndoLen(undoStack.current.length)
    // Fire-and-forget: run inverse on server without blocking UI
    entry.inverse().then((result) => {
      if (result?.error) toast.error(locale === "es" ? "Error al deshacer" : "Undo failed")
      fetchWeekSilent(weekStart)
    }).catch(() => {
      toast.error(locale === "es" ? "Error al deshacer" : "Undo failed")
      fetchWeekSilent(weekStart)
    })
  }

  async function handleRedo() {
    const entry = redoStack.current.pop()
    if (!entry) return
    const currentData = weekData
    if (entry.forwardSnapshot) {
      lastFetchId.current++
      setWeekData(entry.forwardSnapshot)
    }
    if (currentData) {
      undoStack.current = [...undoStack.current.slice(-19), { snapshot: currentData, forwardSnapshot: entry.forwardSnapshot, inverse: entry.inverse, forward: entry.forward }]
      setUndoLen(undoStack.current.length)
    }
    setRedoLen(redoStack.current.length)
    // Fire-and-forget: run forward on server without blocking UI
    entry.forward().then((result) => {
      if (result?.error) toast.error(locale === "es" ? "Error al rehacer" : "Redo failed")
      fetchWeekSilent(weekStart)
    }).catch(() => {
      toast.error(locale === "es" ? "Error al rehacer" : "Redo failed")
      fetchWeekSilent(weekStart)
    })
  }

  // Clear stacks when navigating weeks
  useEffect(() => {
    undoStack.current = []
    redoStack.current = []
    setUndoLen(0)
    setRedoLen(0)
  }, [weekStart])

  // Keyboard shortcuts — Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
  const undoRedoRef = useRef({ handleUndo, handleRedo })
  useEffect(() => { undoRedoRef.current = { handleUndo, handleRedo } })
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoRedoRef.current.handleUndo() }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); undoRedoRef.current.handleRedo() }
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
