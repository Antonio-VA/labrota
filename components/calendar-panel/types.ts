import type React from "react"
import type { RotaDay } from "@/app/(clinic)/rota/actions"

export type ViewMode      = "week" | "month"
export type CalendarLayout = "shift" | "person"
export type Assignment    = RotaDay["assignments"][0]

export type DeptMaps = { border: Record<string, string>; label: Record<string, string>; order: Record<string, number> }

export type MenuItem = { label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean; dividerBefore?: boolean; destructive?: boolean; active?: boolean; sectionLabel?: string }
