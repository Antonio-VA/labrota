import React from "react"
import { Plane, Cross, User, GraduationCap, Baby, CalendarX } from "lucide-react"
import { DEFAULT_DEPT_BORDER } from "@/lib/department-colors"

export { DEFAULT_DEPT_BORDER }

export const COLOR_HEX: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}

export function resolveColor(color: string): string {
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}

export interface Assignment {
  id: string
  staff_id: string
  date: string
  shift_type: string
  function_label: string | null
  tecnica_id: string | null
  whole_team: boolean
  is_manual_override: boolean
  staff: { id: string; first_name: string; last_name: string; role: string }
}

export const LEAVE_ICON_MAP: Record<string, React.ElementType> = {
  annual: Plane,
  sick: Cross,
  personal: User,
  training: GraduationCap,
  maternity: Baby,
  other: CalendarX,
}
