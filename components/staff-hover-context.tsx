"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface StaffHoverCtx {
  hoveredStaffId: string | null
  setHovered: (id: string | null) => void
}

const Ctx = createContext<StaffHoverCtx>({ hoveredStaffId: null, setHovered: () => {} })

export function StaffHoverProvider({ children }: { children: ReactNode }) {
  const [hoveredStaffId, setHoveredStaffId] = useState<string | null>(null)
  const setHovered = useCallback((id: string | null) => setHoveredStaffId(id), [])
  return <Ctx.Provider value={{ hoveredStaffId, setHovered }}>{children}</Ctx.Provider>
}

export function useStaffHover() {
  return useContext(Ctx)
}
