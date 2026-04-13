import type { WorkingDay } from "@/lib/types/database"

export const STAFF_PASTEL_COLORS = [
  "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
  "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  "#E9D5FF", "#FEF08A", "#CCFBF1", "#FFE4E6",
  "#93C5FD", "#86EFAC", "#FCA5A5", "#FCD34D", "#C4B5FD", "#F9A8D4",
  "#6EE7B7", "#FDBA74", "#A5B4FC", "#FDA4AF", "#7DD3FC", "#BEF264",
  "#D8B4FE", "#FDE047", "#99F6E4", "#E0E7FF",
  "#E2E8F0", "#CBD5E1", "#D1D5DB", "#B0B8C4",
  "#E8D5C4", "#D4B896", "#C9B8A8", "#DEC9B0",
]

export const ALL_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export const DEPT_MAP: Record<string, string> = { lab: "lab", andrology: "andrology", admin: "admin" }
