import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAdminFrom = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}))

// Mock server client placeholder — the lock module only uses it for the typed
// SupabaseServerClient generic. We pass a lookalike with the builder chain.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

// ── Import under test ─────────────────────────────────────────────────────────

const { acquireRotaGenerationLock, releaseRotaGenerationLock } = await import(
  "@/lib/rota-generation-lock"
)

// ── Helpers ───────────────────────────────────────────────────────────────────

type UpdateCall = {
  values: { generating_at: string | null }
  rotaId: string
  orClause: string | null
}

function makeSupabaseForAcquire(lockOutcome: { data: { id: string } | null }) {
  const calls: UpdateCall[] = []

  const client = {
    from(_table: string) {
      return {
        update(values: { generating_at: string | null }) {
          const row: UpdateCall = { values, rotaId: "", orClause: null }
          calls.push(row)
          const builder = {
            eq: (_: string, id: string) => {
              row.rotaId = id
              return builder
            },
            or: (clause: string) => {
              row.orClause = clause
              return builder
            },
            select: (_: string) => builder,
            maybeSingle: async () => lockOutcome,
            then: (resolve: (v: { data: null; error: null }) => void) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          }
          return builder
        },
      }
    },
  } as unknown as Parameters<typeof acquireRotaGenerationLock>[0]

  return { client, calls }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("acquireRotaGenerationLock", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns true when the atomic UPDATE matches a row", async () => {
    const { client } = makeSupabaseForAcquire({ data: { id: "rota-1" } })
    const ok = await acquireRotaGenerationLock(client, "rota-1")
    expect(ok).toBe(true)
  })

  it("returns false when another caller already holds the lock", async () => {
    const { client } = makeSupabaseForAcquire({ data: null })
    const ok = await acquireRotaGenerationLock(client, "rota-1")
    expect(ok).toBe(false)
  })

  it("constrains the update to the target rota id", async () => {
    const { client, calls } = makeSupabaseForAcquire({ data: { id: "rota-42" } })
    await acquireRotaGenerationLock(client, "rota-42")
    expect(calls).toHaveLength(1)
    expect(calls[0].rotaId).toBe("rota-42")
  })

  it("uses a stale-cutoff predicate so stuck locks get taken over", async () => {
    const { client, calls } = makeSupabaseForAcquire({ data: { id: "rota-1" } })
    await acquireRotaGenerationLock(client, "rota-1")
    expect(calls[0].orClause).not.toBeNull()
    expect(calls[0].orClause).toMatch(/generating_at\.is\.null/)
    expect(calls[0].orClause).toMatch(/generating_at\.lt\./)

    // The lt cutoff must be in the past — recent enough that a live holder
    // still wins, but not so old that crashed holders wedge the row.
    const match = calls[0].orClause!.match(/generating_at\.lt\.(.+)$/)
    expect(match).toBeTruthy()
    const cutoff = new Date(match![1]).getTime()
    const now = Date.now()
    expect(cutoff).toBeLessThan(now)
    expect(now - cutoff).toBeGreaterThan(2 * 60 * 1000) // at least ~2 min back
    expect(now - cutoff).toBeLessThan(5 * 60 * 1000)    // not absurdly old
  })

  it("writes a fresh ISO timestamp into generating_at on acquire", async () => {
    const { client, calls } = makeSupabaseForAcquire({ data: { id: "rota-1" } })
    await acquireRotaGenerationLock(client, "rota-1")
    const ts = calls[0].values.generating_at
    expect(typeof ts).toBe("string")
    expect(Date.now() - new Date(ts!).getTime()).toBeLessThan(5_000)
  })
})

describe("releaseRotaGenerationLock", () => {
  beforeEach(() => vi.clearAllMocks())

  it("clears generating_at on the target rota via the admin client", async () => {
    const observed: { values?: Record<string, unknown>; id?: string } = {}
    mockAdminFrom.mockImplementation((_table: string) => ({
      update: (values: Record<string, unknown>) => {
        observed.values = values
        return {
          eq: (_col: string, id: string) => {
            observed.id = id
            return Promise.resolve({ error: null })
          },
        }
      },
    }))
    await releaseRotaGenerationLock({} as Parameters<typeof releaseRotaGenerationLock>[0], "rota-99")
    expect(observed.values).toEqual({ generating_at: null })
    expect(observed.id).toBe("rota-99")
  })
})
