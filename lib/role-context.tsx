"use client"

import { createContext, useContext } from "react"

type UserRole = "admin" | "manager" | "viewer"

interface RoleContextValue {
  role: UserRole
  staffId: string | null
}

const RoleContext = createContext<RoleContextValue>({ role: "admin", staffId: null })

export function RoleProvider({ role, staffId = null, children }: { role: UserRole; staffId?: string | null; children: React.ReactNode }) {
  return <RoleContext value={{ role, staffId }}>{children}</RoleContext>
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
