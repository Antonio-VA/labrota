import type { Plane } from "lucide-react"
import { Cross, User, GraduationCap, Baby, CalendarX } from "lucide-react"
// Re-import Plane separately since it's a default-style name
import { Plane as PlaneIcon } from "lucide-react"

export const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

export function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#1e293b" : "#ffffff"
}

export const ROLE_LABEL: Record<string, Record<string, string>> = {
  es: { lab: "Lab", andrology: "Andrología", admin: "Admin" },
  en: { lab: "Lab", andrology: "Andrology", admin: "Admin" },
}

export const TASK_NAMED_COLORS: Record<string, string> = {
  amber: "#F59E0B", blue: "#3B82F6", green: "#10B981", purple: "#8B5CF6",
  coral: "#EF4444", teal: "#14B8A6", slate: "#64748B", red: "#EF4444",
}

export const LEAVE_ICONS: Record<string, typeof Plane> = {
  annual: PlaneIcon, sick: Cross, personal: User, training: GraduationCap, maternity: Baby, other: CalendarX,
}

export const LEAVE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  annual:    { border: "#7DD3FC", bg: "#F0F9FF", text: "#0369A1" },
  sick:      { border: "#FCA5A5", bg: "#FEF2F2", text: "#DC2626" },
  personal:  { border: "#C4B5FD", bg: "#F5F3FF", text: "#7C3AED" },
  training:  { border: "#FCD34D", bg: "#FFFBEB", text: "#D97706" },
  maternity: { border: "#F9A8D4", bg: "#FDF2F8", text: "#DB2777" },
  other:     { border: "#CBD5E1", bg: "#F8FAFC", text: "#475569" },
}

const DAY_ABBR_ES = ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
const DAY_ABBR_EN = ["Su","Mo","Tu","We","Th","Fr","Sa"]
export const dayAbbrFor = (locale: string) => locale === "en" ? DAY_ABBR_EN : DAY_ABBR_ES
