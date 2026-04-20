import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/get-org-id", () => ({ getOrgId: vi.fn(async () => "org-1") }))

const mockCreateAdminClient = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }))

const mockCreateClient = vi.fn()
vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }))

// ── Chain helper ───────────────────────────────────────────────────────────────

// A fluent query-chain mock: every query method returns itself so chains of
// .eq().eq().gte()... work without boilerplate. Awaiting the chain resolves
// to { data, error: null }. Call .single() / .maybeSingle() for singular reads.
function chain(data: unknown = null) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "neq", "in", "gte", "lte", "order", "limit", "not", "or"]) {
    c[m] = () => c
  }
  c.single = async () => ({ data })
  c.maybeSingle = async () => ({ data })
  c.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    Promise.resolve({ data, error: null }).then(resolve)
  return c
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROTA_ID = "rota-1"
const WEEK_START = "2026-04-21"
const SNAPSHOT_ID = "snap-1"

const SNAPSHOT_DATA = {
  rota_id: ROTA_ID,
  date: WEEK_START,
  week_start: WEEK_START,
  assignments: [
    { id: "a1", staff_id: "staff-A", shift_type: "am", function_label: null, is_manual_override: false, date: WEEK_START, staff: { first_name: "Ana", last_name: "López", role: "lab" } },
    { id: "a2", staff_id: "staff-B", shift_type: "am", function_label: null, is_manual_override: false, date: WEEK_START, staff: { first_name: "Ben", last_name: "Smith", role: "lab" } },
  ],
}

const OLD_IDS = [{ id: "old-1" }, { id: "old-2" }]

/** Admin mock that makes captureWeekSnapshot/captureSnapshot exit immediately (no rota found). */
function makeCaptureMock() {
  return { from: () => chain(null) }
}

/**
 * User-scoped Supabase mock for the restore functions.
 * - snapshotData: what the snapshot select returns
 * - currentIds: what the assignments-by-rota-id select returns
 * - callLog: array that captures "insert" and "delete" in order
 */
function makeClientMock(
  snapshotData: unknown,
  currentIds: { id: string }[],
  callLog: string[],
  insertError: { message: string } | null = null,
) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "u@t.com" } } }) },
    from: (table: string) => {
      if (table === "rota_snapshots") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: snapshotData }),
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            }),
          }),
          insert: async () => ({ error: null }),
        }
      }
      if (table === "rota_assignments") {
        return {
          // ID fetch: .select("id").eq("rota_id", ...) — possibly chained with .eq("date", ...)
          // We return a thenable chain so both 1-eq and 2-eq variants work.
          select: () => {
            const ids = currentIds
            const c: Record<string, unknown> = {}
            c.eq = () => c
            c.then = (resolve: (v: { data: { id: string }[] }) => void) =>
              Promise.resolve({ data: ids }).then(resolve)
            return c
          },
          insert: async (_rows: unknown) => {
            callLog.push("insert")
            return { error: insertError }
          },
          delete: () => ({
            in: async (_col: string, _ids: string[]) => {
              callLog.push("delete")
              return { error: null }
            },
          }),
        }
      }
      return chain(null)
    },
  }
}

// ── Import under test ──────────────────────────────────────────────────────────

const { restoreWeekSnapshot, restoreSnapshot } = await import("@/lib/rota-snapshots")

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("restoreWeekSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateAdminClient.mockReturnValue(makeCaptureMock())
  })

  it("returns error when no org is found", async () => {
    const { getOrgId } = await import("@/lib/get-org-id")
    vi.mocked(getOrgId).mockResolvedValueOnce(null)
    mockCreateClient.mockResolvedValue(makeClientMock(SNAPSHOT_DATA, OLD_IDS, []))
    const result = await restoreWeekSnapshot(SNAPSHOT_ID)
    expect(result.error).toMatch(/organisation/i)
  })

  it("returns error when snapshot is not found", async () => {
    mockCreateClient.mockResolvedValue(makeClientMock(null, [], []))
    const result = await restoreWeekSnapshot(SNAPSHOT_ID)
    expect(result.error).toMatch(/not found/i)
  })

  it("inserts new rows before deleting old rows", async () => {
    const callLog: string[] = []
    mockCreateClient.mockResolvedValue(makeClientMock(SNAPSHOT_DATA, OLD_IDS, callLog))
    const result = await restoreWeekSnapshot(SNAPSHOT_ID)
    expect(result.error).toBeUndefined()
    const insertIdx = callLog.indexOf("insert")
    const deleteIdx = callLog.indexOf("delete")
    expect(insertIdx).toBeGreaterThanOrEqual(0)
    expect(deleteIdx).toBeGreaterThan(insertIdx)
  })

  it("aborts before deleting when insert fails", async () => {
    const callLog: string[] = []
    mockCreateClient.mockResolvedValue(
      makeClientMock(SNAPSHOT_DATA, OLD_IDS, callLog, { message: "unique violation" }),
    )
    const result = await restoreWeekSnapshot(SNAPSHOT_ID)
    expect(result.error).toMatch(/unique violation/i)
    expect(callLog).not.toContain("delete")
  })

  it("skips insert when snapshot has no assignments, still deletes old rows", async () => {
    const emptySnap = { ...SNAPSHOT_DATA, assignments: [] }
    const callLog: string[] = []
    mockCreateClient.mockResolvedValue(makeClientMock(emptySnap, OLD_IDS, callLog))
    const result = await restoreWeekSnapshot(SNAPSHOT_ID)
    expect(result.error).toBeUndefined()
    expect(callLog).not.toContain("insert")
    expect(callLog).toContain("delete")
  })

  it("returns {} on success", async () => {
    const callLog: string[] = []
    mockCreateClient.mockResolvedValue(makeClientMock(SNAPSHOT_DATA, OLD_IDS, callLog))
    const result = await restoreWeekSnapshot(SNAPSHOT_ID)
    expect(result).toEqual({})
  })
})

describe("restoreSnapshot (single-day)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateAdminClient.mockReturnValue(makeCaptureMock())
  })

  it("returns error when snapshot is not found", async () => {
    mockCreateClient.mockResolvedValue(makeClientMock(null, [], []))
    const result = await restoreSnapshot(SNAPSHOT_ID)
    expect(result.error).toMatch(/not found/i)
  })

  it("inserts new rows before deleting old rows", async () => {
    const callLog: string[] = []
    mockCreateClient.mockResolvedValue(makeClientMock(SNAPSHOT_DATA, OLD_IDS, callLog))
    const result = await restoreSnapshot(SNAPSHOT_ID)
    expect(result.error).toBeUndefined()
    const insertIdx = callLog.indexOf("insert")
    const deleteIdx = callLog.indexOf("delete")
    expect(insertIdx).toBeGreaterThanOrEqual(0)
    expect(deleteIdx).toBeGreaterThan(insertIdx)
  })

  it("returns {} on success", async () => {
    const callLog: string[] = []
    mockCreateClient.mockResolvedValue(makeClientMock(SNAPSHOT_DATA, OLD_IDS, callLog))
    const result = await restoreSnapshot(SNAPSHOT_ID)
    expect(result).toEqual({})
  })
})
