"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface StaffHoverCtx {
  hoveredStaffId: string | null
  setHovered: (id: string | null) => void
  enabled: boolean
  setEnabled: (v: boolean) => void
}

const Ctx = createContext<StaffHoverCtx>({ hoveredStaffId: null, setHovered: () => {}, enabled: true, setEnabled: () => {} })

export function StaffHoverProvider({ children, defaultEnabled = true }: { children: ReactNode; defaultEnabled?: boolean }) {
  const [hoveredStaffId, setHoveredStaffId] = useState<string | null>(null)
  const [enabled, setEnabledState] = useState(defaultEnabled)
  const setHovered = useCallback((id: string | null) => {
    setHoveredStaffId(enabled ? id : null)
  }, [enabled])
  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v)
    if (!v) setHoveredStaffId(null)
  }, [])
  return <Ctx.Provider value={{ hoveredStaffId: enabled ? hoveredStaffId : null, setHovered, enabled, setEnabled }}>{children}</Ctx.Provider>
}

export function useStaffHover() {
  return useContext(Ctx)
}
