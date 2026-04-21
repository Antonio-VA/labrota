import type { WorkingDay } from "@/lib/types/database"

// ── Time ─────────────────────────────────────────────────────────────────────
export const ONE_DAY_MS = 86_400_000
export const FOUR_WEEKS_DAYS = 28
export const COOKIE_MAX_AGE_ONE_YEAR = 365 * 86_400

// ── Rota engine ───────────────────────────────────────────────────────────────
/** How many weeks of recent assignments to look back when calculating rotation fairness */
export const RECENT_ASSIGNMENTS_LOOKBACK_DAYS = 28

// ── AI ────────────────────────────────────────────────────────────────────────
export const CLAUDE_MODEL = "claude-sonnet-4-6"

// ── Calendar ──────────────────────────────────────────────────────────────────
export const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
export type DayCode = typeof DAY_CODES[number]

// ── Staff ─────────────────────────────────────────────────────────────────────
export const ALL_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

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
