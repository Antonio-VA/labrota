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
