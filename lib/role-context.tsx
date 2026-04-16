"use client"

import { createContext, useContext, useMemo } from "react"

type UserRole = "admin" | "manager" | "viewer"

interface RoleContextValue {
  role: UserRole
  staffId: string | null
}

const RoleContext = createContext<RoleContextValue>({ role: "admin", staffId: null })

export function RoleProvider({ role, staffId = null, children }: { role: UserRole; staffId?: string | null; children: React.ReactNode }) {
  const value = useMemo(() => ({ role, staffId }), [role, staffId])
  return <RoleContext value={value}>{children}</RoleContext>
}

export function useUserRole(): UserRole {
  return useContext(RoleContext).role
}

export function useCanEdit(): boolean {
  return useContext(RoleContext).role !== "viewer"
}

export function useViewerStaffId(): string | null {
  return useContext(RoleContext).staffId
}
