"use client"

import { useRouter } from "next/navigation"

interface Props {
  orgId: string
  active: "labrota" | "rrhh"
  hrActive: boolean
}

export function AdminModuleSwitcher({ orgId, active, hrActive }: Props) {
  const router = useRouter()

  if (!hrActive) return null

  return (
    <select
      value={active}
      onChange={(e) => {
        const target = e.target.value
        if (target === "labrota") router.push(`/orgs/${orgId}`)
        else if (target === "rrhh") router.push(`/orgs/${orgId}/rrhh`)
      }}
      className="border border-border rounded-md px-2 py-1 text-[13px] bg-background font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      <option value="labrota">LabRota</option>
      <option value="rrhh">RRHH</option>
    </select>
  )
}
