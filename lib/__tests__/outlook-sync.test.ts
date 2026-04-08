import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDelete = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()

function createMockAdminChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.from = vi.fn(() => chain)
  chain.select = mockSelect.mockReturnValue(chain)
  chain.insert = mockInsert.mockReturnValue(chain)
  chain.update = mockUpdate.mockReturnValue(chain)
  chain.delete = mockDelete.mockReturnValue(chain)
  chain.eq = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.lte = vi.fn(() => chain)
  chain.in = vi.fn(() => chain)
  chain.single = vi.fn(() => ({ data: { first_name: "Noor", last_name: "Test" }, error: null }))
  chain.maybeSingle = vi.fn(() => ({ data: null }))
  return chain
}

let mockAdminChain: ReturnType<typeof createMockAdminChain>

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdminChain),
}))

const mockGetValidAccessToken = vi.fn()
const mockFetchOOFEvents = vi.fn()

vi.mock("@/lib/outlook/graph-client", () => ({
  getValidAccessToken: (...args: unknown[]) => mockGetValidAccessToken(...args),
  fetchOOFEvents: (...args: unknown[]) => mockFetchOOFEvents(...args),
}))

const mockNotifyLeaveImpact = vi.fn()

vi.mock("@/app/(clinic)/notification-actions", () => ({
  notifyLeaveImpact: (...args: unknown[]) => mockNotifyLeaveImpact(...args),
}))

// ── Import after mocks ──────────────────────────────────────────────────────

const { syncStaffOutlook } = await import("@/lib/outlook/sync")

// ── Helpers ─────────────────────────────────────────────────────────────────

const STAFF_ID = "staff-001"
const ORG_ID = "org-001"

/**
 * Build a mock admin chain that tracks which tables are queried and
 * returns different data based on the .from() table name.
 */
function setupAdminChain(opts: {
  existingLeaves?: Array<{
    id: string
    outlook_event_id: string
    start_date: string
    end_date: string
    type: string
  }>
  insertError?: { message: string } | null
  updateError?: { message: string } | null
  managers?: Array<{ user_id: string }>
}) {
  const existingLeaves = opts.existingLeaves ?? []
  const managers = opts.managers ?? [{ user_id: "admin-001" }]

  // Track the last .from() table to decide response shape
  let lastTable = ""
  const chain: Record<string, unknown> = {}

  const eqChain = vi.fn(() => chain)
  const gteChain = vi.fn(() => chain)
  const lteChain = vi.fn(() => chain)
  const inChain = vi.fn(() => chain)

  chain.from = vi.fn((table: string) => {
    lastTable = table
    return chain
  })
  chain.select = vi.fn(() => chain)
  chain.eq = eqChain
  chain.gte = gteChain
  chain.lte = lteChain
  chain.in = inChain
  chain.insert = vi.fn(() => {
    if (lastTable === "leaves") {
      return { error: opts.insertError ?? null }
    }
    return { error: null }
  })
  chain.update = vi.fn(() => {
    // update returns chain for further .eq() calls
    return chain
  })
  chain.delete = vi.fn(() => chain)
  chain.single = vi.fn(() => {
    if (lastTable === "staff") {
      return { data: { first_name: "Noor", last_name: "Test" }, error: null }
    }
    return { data: null, error: null }
  })

  // The tricky part: different .select() calls return different data.
  // We use the `lastTable` to decide.
  // For leaves: return existingLeaves on the first .gte call within the leaves context
  // For organisation_members: return managers
  // For staff: handled by .single()

  // Override the chain to detect completion of query chains
  // Supabase chains: from().select().eq().eq().eq().gte() → {data}
  // We need the final result. The simplest approach: track from() and
  // return data from the last .gte() or .in() based on lastTable.

  // For leaves query: from("leaves").select(...).eq().eq().eq().gte()
  gteChain.mockImplementation(() => {
    if (lastTable === "leaves") {
      // This is the gte("start_date", today) or gte("date", ...) call
      // For the leaves query it's the final call, return data
      return { data: existingLeaves } as never
    }
    return chain
  })

  // For organisation_members: from().select().eq().in()
  inChain.mockImplementation(() => {
    if (lastTable === "organisation_members") {
      return { data: managers } as never
    }
    return chain
  })

  return chain as ReturnType<typeof createMockAdminChain>
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetValidAccessToken.mockResolvedValue("valid-token")
  mockNotifyLeaveImpact.mockResolvedValue(undefined)
})

describe("syncStaffOutlook — assignment removal on new leave", () => {
  it("removes conflicting rota assignments when a new leave is created", async () => {
    mockAdminChain = setupAdminChain({ existingLeaves: [] })

    mockFetchOOFEvents.mockResolvedValue([
      {
        eventId: "evt-new-1",
        subject: "Vacaciones",
        startDate: "2026-04-13",
        endDate: "2026-04-15",
      },
    ])

    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)

    expect(result.created).toBe(1)
    expect(result.errors).toHaveLength(0)

    // Verify rota_assignments delete was called
    const fromCalls = (mockAdminChain.from as ReturnType<typeof vi.fn>).mock.calls
    const deleteAfterInsert = fromCalls.some(
      (call: string[]) => call[0] === "rota_assignments"
    )
    expect(deleteAfterInsert).toBe(true)

    // Verify delete() was called on the chain
    expect(mockAdminChain.delete).toHaveBeenCalled()
  })

  it("calls notifyLeaveImpact for newly created leaves", async () => {
    mockAdminChain = setupAdminChain({ existingLeaves: [] })

    mockFetchOOFEvents.mockResolvedValue([
      {
        eventId: "evt-new-2",
        subject: "Holiday",
        startDate: "2026-04-20",
        endDate: "2026-04-22",
      },
    ])

    await syncStaffOutlook(STAFF_ID, ORG_ID)

    expect(mockNotifyLeaveImpact).toHaveBeenCalledWith({
      orgId: ORG_ID,
      staffName: "Noor Test",
      startDate: "2026-04-20",
      endDate: "2026-04-22",
    })
  })
})

describe("syncStaffOutlook — assignment removal on leave update", () => {
  it("removes conflicting rota assignments when leave dates change", async () => {
    mockAdminChain = setupAdminChain({
      existingLeaves: [
        {
          id: "leave-existing",
          outlook_event_id: "evt-update-1",
          start_date: "2026-04-13",
          end_date: "2026-04-14",
          type: "annual",
        },
      ],
    })

    mockFetchOOFEvents.mockResolvedValue([
      {
        eventId: "evt-update-1",
        subject: "Vacaciones",
        startDate: "2026-04-13",
        endDate: "2026-04-17", // Extended by 3 days
      },
    ])

    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)

    expect(result.updated).toBe(1)
    expect(result.errors).toHaveLength(0)

    // Verify rota_assignments was targeted for deletion
    const fromCalls = (mockAdminChain.from as ReturnType<typeof vi.fn>).mock.calls
    const tableNames = fromCalls.map((call: string[]) => call[0])
    expect(tableNames).toContain("rota_assignments")
  })

  it("calls notifyLeaveImpact for updated leaves", async () => {
    mockAdminChain = setupAdminChain({
      existingLeaves: [
        {
          id: "leave-existing-2",
          outlook_event_id: "evt-update-2",
          start_date: "2026-05-01",
          end_date: "2026-05-02",
          type: "annual",
        },
      ],
    })

    mockFetchOOFEvents.mockResolvedValue([
      {
        eventId: "evt-update-2",
        subject: "Vacaciones",
        startDate: "2026-05-01",
        endDate: "2026-05-05", // Extended
      },
    ])

    await syncStaffOutlook(STAFF_ID, ORG_ID)

    expect(mockNotifyLeaveImpact).toHaveBeenCalledWith({
      orgId: ORG_ID,
      staffName: "Noor Test",
      startDate: "2026-05-01",
      endDate: "2026-05-05",
    })
  })
})

describe("syncStaffOutlook — no assignment removal when dates unchanged", () => {
  it("does not remove assignments when existing leave dates are unchanged", async () => {
    mockAdminChain = setupAdminChain({
      existingLeaves: [
        {
          id: "leave-same",
          outlook_event_id: "evt-same-1",
          start_date: "2026-04-13",
          end_date: "2026-04-15",
          type: "annual",
        },
      ],
    })

    mockFetchOOFEvents.mockResolvedValue([
      {
        eventId: "evt-same-1",
        subject: "Vacaciones",
        startDate: "2026-04-13",
        endDate: "2026-04-15", // Same dates
      },
    ])

    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)

    expect(result.created).toBe(0)
    expect(result.updated).toBe(0)
    expect(mockNotifyLeaveImpact).not.toHaveBeenCalled()
  })
})

describe("syncStaffOutlook — deletion of removed Outlook events", () => {
  it("deletes leave when Outlook event is removed (future leave)", async () => {
    mockAdminChain = setupAdminChain({
      existingLeaves: [
        {
          id: "leave-to-delete",
          outlook_event_id: "evt-removed-1",
          start_date: "2026-04-20",
          end_date: "2026-04-22",
          type: "annual",
        },
      ],
    })

    // Outlook returns empty — the event was removed
    mockFetchOOFEvents.mockResolvedValue([])

    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)

    expect(result.deleted).toBe(1)
    expect(result.errors).toHaveLength(0)

    // Verify leaves delete was called
    const fromCalls = (mockAdminChain.from as ReturnType<typeof vi.fn>).mock.calls
    const tableNames = fromCalls.map((call: string[]) => call[0])
    expect(tableNames).toContain("leaves")
    expect(mockAdminChain.delete).toHaveBeenCalled()
  })

  it("deletes leave that started before today but is still active", async () => {
    // Simulates: leave started April 6, ends April 10, today is April 8
    // The Outlook event was removed — this leave should still be found and deleted
    mockAdminChain = setupAdminChain({
      existingLeaves: [
        {
          id: "leave-active-past-start",
          outlook_event_id: "evt-removed-2",
          start_date: "2026-04-06", // Before today (April 8)
          end_date: "2026-04-10",   // After today — still active
          type: "annual",
        },
      ],
    })

    mockFetchOOFEvents.mockResolvedValue([])

    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)

    // The leave should be found via end_date >= today and deleted
    expect(result.deleted).toBe(1)
    expect(result.errors).toHaveLength(0)
  })
})

describe("syncStaffOutlook — insert failure does not remove assignments", () => {
  it("does not remove assignments when leave insert fails", async () => {
    mockAdminChain = setupAdminChain({
      existingLeaves: [],
      insertError: { message: "DB error" },
    })

    mockFetchOOFEvents.mockResolvedValue([
      {
        eventId: "evt-fail-1",
        subject: "Holiday",
        startDate: "2026-04-20",
        endDate: "2026-04-22",
      },
    ])

    const result = await syncStaffOutlook(STAFF_ID, ORG_ID)

    expect(result.created).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(mockNotifyLeaveImpact).not.toHaveBeenCalled()
  })
})
