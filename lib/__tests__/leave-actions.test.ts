import { describe, it, expect, vi, beforeEach } from "vitest"
import type { LeaveType } from "@/lib/types/database"

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockInsert = vi.fn()

function chainable() {
  const chain: Record<string, unknown> = {}
  chain.from = mockFrom.mockReturnValue(chain)
  chain.select = mockSelect.mockReturnValue(chain)
  chain.eq = mockEq.mockReturnValue(chain)
  chain.single = mockSingle
  chain.insert = mockInsert.mockReturnValue(chain)
  chain.neq = vi.fn(() => chain)
  chain.in = vi.fn(() => chain)
  chain.lte = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  return chain
}

let mockSupabase: ReturnType<typeof chainable>

const mockGetUser = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const sb = mockSupabase
    sb.auth = { getUser: mockGetUser } as never
    return sb
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    // Admin client for the insert — return a simple chainable
    const adminChain: Record<string, ReturnType<typeof vi.fn>> = {
      from: vi.fn(() => adminChain),
      insert: vi.fn(() => adminChain),
      select: vi.fn(() => adminChain),
      single: vi.fn(() => ({ data: { id: "leave-1" }, error: null })),
      eq: vi.fn(() => adminChain),
      neq: vi.fn(() => adminChain),
      in: vi.fn(() => adminChain),
      lte: vi.fn(() => adminChain),
      gte: vi.fn(() => adminChain),
      maybeSingle: vi.fn(() => ({ data: null })),
    }
    adminChain.auth = { admin: { inviteUserByEmail: vi.fn() } } as never
    return adminChain
  }),
}))

vi.mock("@/lib/get-org-id", () => ({
  getOrgId: vi.fn(async () => "org-test-1"),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/app/(clinic)/notification-actions", () => ({
  notifyLeaveImpact: vi.fn(),
}))

// ── Import after mocks ──────────────────────────────────────────────────────

const { requestLeave } = await import("@/app/(clinic)/leaves/actions")

// ── Tests ────────────────────────────────────────────────────────────────────

const TEST_USER_ID = "user-abc-123"
const TEST_STAFF_ID = "staff-xyz-789"
const OTHER_STAFF_ID = "staff-other-000"

const baseParams = {
  staffId: TEST_STAFF_ID,
  type: "annual" as LeaveType,
  startDate: "2026-04-10",
  endDate: "2026-04-12",
  notes: "Family holiday",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSupabase = chainable()
  // Default: authenticated user
  mockGetUser.mockResolvedValue({
    data: { user: { id: TEST_USER_ID } },
  })
})

describe("requestLeave — staffId ownership verification", () => {
  it("succeeds when staffId matches the authenticated user's linked_staff_id", async () => {
    // organisation_members query returns matching linked_staff_id
    mockSingle.mockResolvedValue({
      data: { linked_staff_id: TEST_STAFF_ID },
    })

    const result = await requestLeave(baseParams)

    // Should not have an ownership error
    expect(result.error).toBeUndefined()
  })

  it("rejects when staffId does not match linked_staff_id", async () => {
    // User's linked_staff_id is different from the requested staffId
    mockSingle.mockResolvedValue({
      data: { linked_staff_id: OTHER_STAFF_ID },
    })

    const result = await requestLeave({
      ...baseParams,
      staffId: TEST_STAFF_ID, // requesting for TEST_STAFF_ID
    })

    expect(result.error).toBe("You can only request leave for yourself.")
  })

  it("rejects when user has no linked_staff_id", async () => {
    mockSingle.mockResolvedValue({
      data: { linked_staff_id: null },
    })

    const result = await requestLeave(baseParams)

    expect(result.error).toBe("You can only request leave for yourself.")
  })

  it("rejects when organisation_members record is missing", async () => {
    mockSingle.mockResolvedValue({ data: null })

    const result = await requestLeave(baseParams)

    expect(result.error).toBe("You can only request leave for yourself.")
  })

  it("rejects when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await requestLeave(baseParams)

    expect(result.error).toBe("Not authenticated.")
  })

  it("rejects when end date is before start date", async () => {
    mockSingle.mockResolvedValue({
      data: { linked_staff_id: TEST_STAFF_ID },
    })

    const result = await requestLeave({
      ...baseParams,
      startDate: "2026-04-15",
      endDate: "2026-04-10",
    })

    expect(result.error).toBe("La fecha de fin debe ser posterior a la de inicio.")
  })
})
