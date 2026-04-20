import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetValidAccessToken = vi.fn()
const mockFetchOOFEvents = vi.fn()

vi.mock("@/lib/outlook/graph-client", () => ({
  getValidAccessToken: mockGetValidAccessToken,
  fetchOOFEvents: mockFetchOOFEvents,
}))

vi.mock("@/lib/format-date", () => ({
  toISODate: vi.fn((ms?: number) => (ms ? new Date(ms) : new Date()).toISOString().slice(0, 10)),
  formatDateRange: vi.fn(() => "1 Jan – 7 Jan 2026"),
  formatDateWithYear: vi.fn((d: string) => d),
  getMondayOf: vi.fn((d: string) => d),
}))

const mockAdminFrom = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}))

// ── Chain helper ───────────────────────────────────────────────────────────────

// Fluent chain: every builder method returns itself; awaiting resolves to
// { data, error: null }. .single() / .maybeSingle() return resolved promises.
function chain(data: unknown = null) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "neq", "in", "gte", "lte", "order", "limit", "not", "or", "delete", "update"]) {
    c[m] = (..._args: unknown[]) => c
  }
  c.single = async () => ({ data, error: null })
  c.maybeSingle = async () => ({ data, error: null })
  c.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    Promise.resolve({ data, error: null }).then(resolve)
  return c
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ORG_ID = "org-1"
const STAFF_ID = "staff-1"

type ExistingLeave = { id: string; outlook_event_id: string; start_date: string; end_date: string; type: string }

/** Build admin.from() mock for a given test scenario. */
function makeAdminFrom(opts: {
  staffExists: boolean
  existingLeaves?: ExistingLeave[]
  onInsert?: (row: unknown) => void
  onUpdate?: (row: unknown) => void
  onDeleteLeave?: (id: string) => void
}) {
  return (table: string) => {
    // ── staff ──
    if (table === "staff") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: opts.staffExists ? { id: STAFF_ID } : null }) }),
            single: async () => ({ data: opts.staffExists ? { first_name: "Ana", last_name: "López" } : null }),
          }),
          single: async () => ({ data: opts.staffExists ? { first_name: "Ana", last_name: "López" } : null }),
        }),
      }
    }

    // ── leaves ──
    if (table === "leaves") {
      return {
        select: () => chain(opts.existingLeaves ?? []),
        insert: async (row: unknown) => {
          opts.onInsert?.(row)
          return { error: null }
        },
        update: (row: unknown) => {
          opts.onUpdate?.(row)
          return chain(null)
        },
        delete: () => {
          return {
            eq: (col: string, val: string) => {
              opts.onDeleteLeave?.(val)
              return chain(null)
            },
            in: (_col: string, ids: string[]) => {
              ids.forEach(id => opts.onDeleteLeave?.(id))
              return chain(null)
            },
          }
        },
      }
    }

    // ── rota_assignments ──
    // syncStaffOutlook deletes conflicting assignments when a new OOF is created.
    // The chain is: .delete().eq().eq().gte().lte()
    if (table === "rota_assignments") {
      return chain(null)
    }

    // ── outlook_connections ──
    if (table === "outlook_connections") {
      return {
        select: () => chain(null),
        update: () => chain(null),
      }
    }

    // ── organisation_members, notifications, etc. ──
    return chain(null)
  }
}

// ── Import under test ──────────────────────────────────────────────────────────

const { syncStaffOutlook } = await import("@/lib/outlook/sync")

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("syncStaffOutlook", () => {
  beforeEach(() => vi.clearAllMocks())

  it("rejects a staffId that does not belong to the given org", async () => {
    mockAdminFrom.mockImplementation(makeAdminFrom({ staffExists: false }))
    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/organisation/i)
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
  })

  it("returns error when access token fetch fails", async () => {
    mockAdminFrom.mockImplementation(makeAdminFrom({ staffExists: true }))
    mockGetValidAccessToken.mockRejectedValue(new Error("token revoked"))
    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/token revoked/i)
    expect(mockFetchOOFEvents).not.toHaveBeenCalled()
  })

  it("returns error when Graph API call fails", async () => {
    mockAdminFrom.mockImplementation(makeAdminFrom({ staffExists: true }))
    mockGetValidAccessToken.mockResolvedValue("access-token-abc")
    mockFetchOOFEvents.mockRejectedValue(new Error("Graph API 503"))
    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/graph api 503/i)
  })

  it("returns zero counts and no errors when calendar has no OOF events", async () => {
    mockAdminFrom.mockImplementation(makeAdminFrom({ staffExists: true }))
    mockGetValidAccessToken.mockResolvedValue("access-token")
    mockFetchOOFEvents.mockResolvedValue([])
    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)
    expect(result.errors).toHaveLength(0)
    expect(result.created).toBe(0)
    expect(result.updated).toBe(0)
    expect(result.deleted).toBe(0)
  })

  it("creates a leave for a new OOF event and reports created = 1", async () => {
    const insertCalls: unknown[] = []
    mockAdminFrom.mockImplementation(
      makeAdminFrom({ staffExists: true, onInsert: (row) => insertCalls.push(row) }),
    )
    mockGetValidAccessToken.mockResolvedValue("access-token")
    mockFetchOOFEvents.mockResolvedValue([
      { eventId: "evt-1", subject: "Vacation", startDate: "2026-05-01", endDate: "2026-05-07" },
    ])
    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)
    expect(result.created).toBe(1)
    expect(result.errors).toHaveLength(0)
    const insertedArr = insertCalls[0] as Record<string, unknown>[]
    const inserted = insertedArr[0]
    expect(inserted.outlook_event_id).toBe("evt-1")
    expect(inserted.type).toBe("annual")
    expect(inserted.staff_id).toBe(STAFF_ID)
    expect(inserted.organisation_id).toBe(ORG_ID)
  })

  it("updates an existing leave when the OOF event dates change", async () => {
    const updatePayloads: unknown[] = []
    const existing: ExistingLeave[] = [
      { id: "leave-1", outlook_event_id: "evt-1", start_date: "2026-05-01", end_date: "2026-05-05", type: "annual" },
    ]
    mockAdminFrom.mockImplementation(
      makeAdminFrom({ staffExists: true, existingLeaves: existing, onUpdate: (p) => updatePayloads.push(p) }),
    )
    mockGetValidAccessToken.mockResolvedValue("access-token")
    mockFetchOOFEvents.mockResolvedValue([
      { eventId: "evt-1", subject: "Vacation", startDate: "2026-05-01", endDate: "2026-05-10" },
    ])
    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)
    expect(result.updated).toBe(1)
    expect(result.created).toBe(0)
    const updated = updatePayloads[0] as Record<string, unknown>
    expect(updated.end_date).toBe("2026-05-10")
  })

  it("does not update when OOF event dates are unchanged", async () => {
    const updatePayloads: unknown[] = []
    const existing: ExistingLeave[] = [
      { id: "leave-1", outlook_event_id: "evt-1", start_date: "2026-05-01", end_date: "2026-05-07", type: "annual" },
    ]
    mockAdminFrom.mockImplementation(
      makeAdminFrom({ staffExists: true, existingLeaves: existing, onUpdate: (p) => updatePayloads.push(p) }),
    )
    mockGetValidAccessToken.mockResolvedValue("access-token")
    mockFetchOOFEvents.mockResolvedValue([
      { eventId: "evt-1", subject: "Vacation", startDate: "2026-05-01", endDate: "2026-05-07" },
    ])
    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)
    expect(result.updated).toBe(0)
    expect(updatePayloads).toHaveLength(0)
  })

  it("deletes a leave whose Outlook event no longer exists", async () => {
    const deletedIds: string[] = []
    const existing: ExistingLeave[] = [
      { id: "leave-old", outlook_event_id: "evt-gone", start_date: "2026-05-01", end_date: "2026-05-05", type: "annual" },
    ]
    mockAdminFrom.mockImplementation(
      makeAdminFrom({ staffExists: true, existingLeaves: existing, onDeleteLeave: (id) => deletedIds.push(id) }),
    )
    mockGetValidAccessToken.mockResolvedValue("access-token")
    mockFetchOOFEvents.mockResolvedValue([]) // event no longer in calendar
    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)
    expect(result.deleted).toBe(1)
    expect(deletedIds).toContain("leave-old")
  })
})

// ── Leave type keyword mapping ─────────────────────────────────────────────────
// guessLeaveType() is internal; test it via the type assigned to created leaves.

describe("leave type inference", () => {
  beforeEach(() => vi.clearAllMocks())

  async function typeForSubject(subject: string): Promise<string> {
    const insertCalls: unknown[] = []
    mockAdminFrom.mockImplementation(
      makeAdminFrom({ staffExists: true, onInsert: (row) => insertCalls.push(row) }),
    )
    mockGetValidAccessToken.mockResolvedValue("token")
    mockFetchOOFEvents.mockResolvedValue([
      { eventId: "evt-x", subject, startDate: "2026-05-01", endDate: "2026-05-01" },
    ])
    await syncStaffOutlook(STAFF_ID, ORG_ID)
    const arr = insertCalls[0] as Record<string, string>[] | undefined
    return arr?.[0]?.type ?? "not-inserted"
  }

  it.each([
    ["Vacation week",      "annual"],
    ["Vacaciones navideñas", "annual"],
    ["Public Holiday",     "annual"],
    ["Sick day",           "sick"],
    ["Baja médica",        "sick"],
    ["Personal appointment", "personal"],
    ["Asunto propio",      "personal"],
    ["Training course",    "training"],
    ["Formación equipo",   "training"],
    ["Maternity leave",    "maternity"],
    ["Reunión de equipo",  "other"],
  ])('"%s" → "%s"', async (subject, expected) => {
    expect(await typeForSubject(subject)).toBe(expected)
  })
})
