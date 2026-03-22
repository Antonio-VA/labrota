"use client"

import { createContext, useContext } from "react"

type UserRole = "admin" | "manager" | "viewer"

const RoleContext = createContext<UserRole>("admin")

export function RoleProvider({ role, children }: { role: UserRole; children: React.ReactNode }) {
  return <RoleContext value={role}>{children}</RoleContext>
}

export function useUserRole(): UserRole {
  return useContext(RoleContext)
}

export function useCanEdit(): boolean {
  return useContext(RoleContext) !== "viewer"
}
