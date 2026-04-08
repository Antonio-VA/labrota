import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ────────────────────────────────────────────────────────────────────

// Each supabase call returns a chainable object. We track the final result
// via a mutable ref so tests can control what the chain resolves to.
let updateResult: { error: { message: string } | null }
let selectResult: { data: { id: string }[] | null; error: { message: string } | null }

function makeChain() {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.update = vi.fn((_payload: unknown) => {
    lastUpdatePayload = _payload
    return chain
  })
  chain.eq = vi.fn(() => chain)
  chain.in = vi.fn(() => chain)
  chain.select = vi.fn(() => selectResult)
  // For bulkUpdateStaffField the chain is: from().update().eq().eq() — no .select()
  // The final .eq() must return { error }. We use a Proxy to handle this:
  // after .update(), the next 2 .eq() calls return chain, and reading .error returns updateResult.error
  Object.defineProperty(chain, "error", {
    get: () => updateResult.error,
    enumerable: false,
  })
  return chain
}

let lastUpdatePayload: unknown
let mockSupabase: ReturnType<typeof makeChain>

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabase),
}))

vi.mock("@/lib/get-org-id", () => ({
  getOrgId: vi.fn(async () => "org-test-1"),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// ── Import after mocks ──────────────────────────────────────────────────────

const { bulkUpdateStaffField, bulkSoftDeleteStaff } = await import(
  "@/app/(clinic)/staff/actions"
)

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockSupabase = makeChain()
  updateResult = { error: null }
  selectResult = { data: [{ id: "s1" }], error: null }
  lastUpdatePayload = undefined
})

describe("bulkUpdateStaffField", () => {
  it("updates allowlisted fields (e.g. first_name)", async () => {
    const result = await bulkUpdateStaffField([
      { id: "s1", field: "first_name", value: "Ana" },
    ])

    expect(result.updated).toBe(1)
    expect(lastUpdatePayload).toEqual({ first_name: "Ana" })
  })

  it("allows email field", async () => {
    const result = await bulkUpdateStaffField([
      { id: "s1", field: "email", value: "ana@test.com" },
    ])

    expect(result.updated).toBe(1)
    expect(lastUpdatePayload).toEqual({ email: "ana@test.com" })
  })

  it("skips non-allowlisted fields (e.g. organisation_id)", async () => {
    const result = await bulkUpdateStaffField([
      { id: "s1", field: "organisation_id", value: "hacked" },
    ])

    expect(result.updated).toBe(0)
    // update() should never have been called for a disallowed field
    expect((mockSupabase.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it("returns updated: 0 when given empty array", async () => {
    const result = await bulkUpdateStaffField([])
    expect(result.updated).toBe(0)
  })

  it("handles update errors gracefully", async () => {
    updateResult = { error: { message: "DB error" } }

    const result = await bulkUpdateStaffField([
      { id: "s1", field: "first_name", value: "Ana" },
    ])

    expect(result.updated).toBe(0)
  })
})

describe("bulkSoftDeleteStaff", () => {
  it("sets onboarding_status to inactive and sets end_date", async () => {
    selectResult = { data: [{ id: "s1" }, { id: "s2" }], error: null }

    const result = await bulkSoftDeleteStaff(["s1", "s2"])

    expect(result.deleted).toBe(2)
    expect(lastUpdatePayload).toEqual(
      expect.objectContaining({ onboarding_status: "inactive" })
    )
    // end_date should be today's date (YYYY-MM-DD format)
    expect((lastUpdatePayload as Record<string, unknown>).end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("returns deleted: 0 for empty array", async () => {
    const result = await bulkSoftDeleteStaff([])
    expect(result.deleted).toBe(0)
  })

  it("returns error when not authenticated", async () => {
    const { getOrgId } = await import("@/lib/get-org-id")
    vi.mocked(getOrgId).mockResolvedValueOnce(null as never)

    const result = await bulkSoftDeleteStaff(["s1"])
    expect(result.error).toBe("Not authenticated.")
  })
})
