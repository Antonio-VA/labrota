"use client"

import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface Props {
  orgId: string
  orgName: string
  active: "labrota" | "rrhh"
  hrActive: boolean
}

export function AdminModuleSwitcher({ orgId, orgName, active, hrActive }: Props) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-[18px] font-medium truncate">{orgName}</h1>
      <span className="text-[14px] text-muted-foreground">·</span>
      <select
        value={active}
        onChange={(e) => {
          const target = e.target.value
          if (target === "labrota") router.push(`/orgs/${orgId}`)
          else if (target === "rrhh") router.push(`/orgs/${orgId}/rrhh`)
        }}
        className={cn(
          "border border-border rounded-md px-2 py-1 text-[14px] bg-background font-medium",
          "focus:outline-none focus:ring-2 focus:ring-primary/20"
        )}
      >
        <option value="labrota">LabRota</option>
        {hrActive && <option value="rrhh">RRHH</option>}
      </select>
    </div>
  )
}
