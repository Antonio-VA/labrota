import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/get-org-id", () => ({ getOrgId: vi.fn(async () => "org-1") }))
vi.mock("@/lib/swap-email", () => ({
  resendRotaWithSwapNotice: vi.fn(),
  sendSwapTargetEmail: vi.fn(),
  notifySwapTarget: vi.fn(),
  notifySwapInitiator: vi.fn(),
}))

const mockCreateAdminClient = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }))

// ── Helpers ────────────────────────────────────────────────────────────────────

const INIT_ASSIGNMENT = { id: "assign-init", staff_id: "staff-A", shift_type: "am", date: "2026-04-21", rota_id: "rota-1" }
const TARGET_ASSIGNMENT = { id: "assign-target", staff_id: "staff-B", shift_type: "am", date: "2026-04-21", rota_id: "rota-1" }

const BASE_SWAP = {
  id: "swap-1", status: "pending_target", swap_type: "shift_swap",
  initiator_staff_id: "staff-A", initiator_assignment_id: "assign-init",
  target_staff_id: "staff-B", target_assignment_id: "assign-target",
  swap_date: "2026-04-21", swap_shift_type: "am", rota_id: "rota-1",
  organisation_id: "org-1",
}

/** Build an admin client mock that records the sequence of write operations. */
function makeAdminClient(
  swapData: unknown,
  initAssignment: unknown,
  targetAssignment: unknown,
  callLog: string[],
) {
  let assignmentFetchCount = 0
  return {
    from: (table: string) => {
      if (table === "swap_requests") {
        const eqChain = { eq: () => eqChain, single: async () => ({ data: swapData }) }
        return {
          select: () => ({ eq: () => eqChain }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === "rota_assignments") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => {
                assignmentFetchCount++
                return assignmentFetchCount === 1 ? { data: initAssignment } : { data: targetAssignment }
              },
            }),
          }),
          insert: async (_row: unknown) => { callLog.push("insert"); return { error: null } },
          delete: () => ({ eq: async () => { callLog.push("delete"); return { error: null } } }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === "rotas") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
    },
  }
}

// ── Import under test ──────────────────────────────────────────────────────────

const { executeSwap } = await import("@/app/(clinic)/swaps/_actions/lifecycle")

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("executeSwap", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns error when swap is not found", async () => {
    mockCreateAdminClient.mockReturnValue(makeAdminClient(null, null, null, []))
    const result = await executeSwap("swap-missing")
    expect(result.error).toMatch(/not found/i)
  })

  it("returns error when swap is not in pending_target state", async () => {
    const wrongStatus = { ...BASE_SWAP, status: "pending_manager" }
    mockCreateAdminClient.mockReturnValue(makeAdminClient(wrongStatus, INIT_ASSIGNMENT, TARGET_ASSIGNMENT, []))
    const result = await executeSwap("swap-1")
    expect(result.error).toMatch(/correct state/i)
  })

  it("returns error when initiator assignment no longer exists", async () => {
    mockCreateAdminClient.mockReturnValue(makeAdminClient(BASE_SWAP, null, null, []))
    const result = await executeSwap("swap-1")
    expect(result.error).toMatch(/original shift.*no longer exists/i)
  })

  it("returns error when target assignment no longer exists (shift_swap)", async () => {
    mockCreateAdminClient.mockReturnValue(makeAdminClient(BASE_SWAP, INIT_ASSIGNMENT, null, []))
    const result = await executeSwap("swap-1")
    expect(result.error).toMatch(/target.*no longer exists/i)
  })

  describe("shift_swap — insert-before-delete ordering", () => {
    it("inserts both new rows before deleting either old row", async () => {
      const callLog: string[] = []
      mockCreateAdminClient.mockReturnValue(makeAdminClient(BASE_SWAP, INIT_ASSIGNMENT, TARGET_ASSIGNMENT, callLog))
      const result = await executeSwap("swap-1")
      expect(result.error).toBeUndefined()
      // Verify sequence: two inserts, then two deletes
      expect(callLog).toEqual(["insert", "insert", "delete", "delete"])
    })

    it("swaps the staff_id values between the two assignments", async () => {
      const inserts: unknown[] = []
      const admin = makeAdminClient(BASE_SWAP, INIT_ASSIGNMENT, TARGET_ASSIGNMENT, [])
      const origInsert = (admin.from("rota_assignments") as ReturnType<typeof admin.from>).insert
      // Intercept insert to capture payloads
      const assignmentTableRef = {
        ...admin.from("rota_assignments"),
        insert: async (row: unknown) => { inserts.push(row); return { error: null } },
      }
      const patchedAdmin = {
        from: (table: string) => table === "rota_assignments" ? assignmentTableRef : admin.from(table),
      }
      mockCreateAdminClient.mockReturnValue(patchedAdmin)
      await executeSwap("swap-1")
      const inserted = inserts as Array<{ staff_id: string }>
      // First insert gets target's staff_id, second gets initiator's staff_id
      expect(inserted[0]?.staff_id).toBe(TARGET_ASSIGNMENT.staff_id)
      expect(inserted[1]?.staff_id).toBe(INIT_ASSIGNMENT.staff_id)
    })
  })

  describe("day_off — simple cover (no target assignment)", () => {
    it("updates initiator assignment to target staff without insert/delete", async () => {
      const dayOffSwap = {
        ...BASE_SWAP, swap_type: "day_off", target_assignment_id: null,
        target_staff_id: "staff-B",
      }
      const callLog: string[] = []
      let updateWasCalled = false
      const admin = {
        from: (table: string) => {
          if (table === "swap_requests") {
            const eqChain = { eq: () => eqChain, single: async () => ({ data: dayOffSwap }) }
            return {
              select: () => ({ eq: () => eqChain }),
              update: () => ({ eq: async () => ({ error: null }) }),
            }
          }
          if (table === "rota_assignments") {
            return {
              select: () => ({ eq: () => ({ single: async () => ({ data: INIT_ASSIGNMENT }) }) }),
              insert: async (_row: unknown) => { callLog.push("insert"); return { error: null } },
              delete: () => ({ eq: async () => { callLog.push("delete"); return { error: null } } }),
              update: () => { updateWasCalled = true; return { eq: async () => ({ error: null }) } },
            }
          }
          if (table === "rotas") {
            return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
          }
          return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
        },
      }
      mockCreateAdminClient.mockReturnValue(admin)
      const result = await executeSwap("swap-1")
      expect(result.error).toBeUndefined()
      expect(callLog).toHaveLength(0) // no insert/delete, just an update
      expect(updateWasCalled).toBe(true)
    })
  })

  it("returns {} on successful shift_swap", async () => {
    const callLog: string[] = []
    mockCreateAdminClient.mockReturnValue(makeAdminClient(BASE_SWAP, INIT_ASSIGNMENT, TARGET_ASSIGNMENT, callLog))
    const result = await executeSwap("swap-1")
    expect(result).toEqual({})
  })
})
