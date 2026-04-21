import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSupabaseFrom = vi.fn()

vi.mock("@/lib/with-org-id", () => ({
  withOrgId: async <T,>(fn: (orgId: string, supabase: unknown) => Promise<T>) => {
    return fn("org-1", { from: mockSupabaseFrom })
  },
}))

vi.mock("server-only", () => ({}))

// ── Builder ───────────────────────────────────────────────────────────────────

type Capture = {
  selected?: string
  selectOptions?: { count?: string }
  range?: [number, number]
  eqs: Record<string, string>
  gte?: string
  lte?: string
  ilike?: Record<string, string>
  notNull?: string[]
  limit?: number
}

function makeBuilder(result: { data: unknown; count: number | null }) {
  const cap: Capture = { eqs: {} }
  const builder: Record<string, unknown> = {}
  builder.select = (cols: string, opts?: { count?: string }) => {
    cap.selected = cols
    cap.selectOptions = opts
    return builder
  }
  builder.eq = (col: string, val: string) => {
    cap.eqs[col] = val
    return builder
  }
  builder.order = (_col: string, _opts?: unknown) => builder
  builder.range = (from: number, to: number) => {
    cap.range = [from, to]
    return builder
  }
  builder.gte = (_col: string, val: string) => { cap.gte = val; return builder }
  builder.lte = (_col: string, val: string) => { cap.lte = val; return builder }
  builder.ilike = (col: string, pat: string) => {
    ;(cap.ilike ??= {})[col] = pat
    return builder
  }
  builder.not = (col: string, _op: string, _val: unknown) => {
    ;(cap.notNull ??= []).push(col)
    return builder
  }
  builder.limit = (n: number) => { cap.limit = n; return builder }
  builder.then = (resolve: (v: { data: unknown; count: number | null; error: null }) => void) =>
    Promise.resolve({ data: result.data, count: result.count, error: null }).then(resolve)
  // keep builder callable as a thenable above; also keep references for tests
  ;(builder as { __capture: Capture }).__capture = cap
  return builder
}

// ── Import under test ─────────────────────────────────────────────────────────

const { getAuditLogs, getAuditLogUsers } = await import(
  "@/app/(clinic)/lab/audit-actions"
)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getAuditLogs", () => {
  beforeEach(() => vi.clearAllMocks())

  it("asks Supabase for the requested page using range(offset, offset+limit-1)", async () => {
    const builder = makeBuilder({ data: [{ id: "log-1" }], count: 42 })
    mockSupabaseFrom.mockReturnValue(builder)

    const result = await getAuditLogs({ limit: 25, offset: 50 })
    if ("error" in result) throw new Error(result.error)

    const cap = (builder as { __capture: Capture }).__capture
    expect(cap.range).toEqual([50, 74])
    expect(cap.selectOptions?.count).toBe("exact")
    expect(cap.eqs["organisation_id"]).toBe("org-1")
    expect(result.total).toBe(42)
    expect(result.entries).toEqual([{ id: "log-1" }])
  })

  it("defaults to 25 rows from offset 0 when no pagination args given", async () => {
    const builder = makeBuilder({ data: [], count: 0 })
    mockSupabaseFrom.mockReturnValue(builder)

    await getAuditLogs()

    const cap = (builder as { __capture: Capture }).__capture
    expect(cap.range).toEqual([0, 24])
  })

  it("applies action, date, and userEmail filters to the query", async () => {
    const builder = makeBuilder({ data: [], count: 0 })
    mockSupabaseFrom.mockReturnValue(builder)

    await getAuditLogs({
      action: "rota_published",
      from: "2026-01-01",
      to: "2026-01-31",
      userEmail: "ana",
    })

    const cap = (builder as { __capture: Capture }).__capture
    expect(cap.eqs["action"]).toBe("rota_published")
    expect(cap.gte).toBe("2026-01-01")
    expect(cap.lte).toBe("2026-01-31T23:59:59")
    expect(cap.ilike?.["user_email"]).toBe("%ana%")
  })

  it("returns an empty result with total 0 when count is null", async () => {
    const builder = makeBuilder({ data: null, count: null })
    mockSupabaseFrom.mockReturnValue(builder)

    const result = await getAuditLogs()
    if ("error" in result) throw new Error(result.error)

    expect(result.entries).toEqual([])
    expect(result.total).toBe(0)
  })
})

describe("getAuditLogUsers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns distinct non-null emails", async () => {
    const rows = [
      { user_email: "ana@lab.com" },
      { user_email: "ana@lab.com" }, // dup
      { user_email: "bob@lab.com" },
      { user_email: null },
    ]
    const builder = makeBuilder({ data: rows, count: rows.length })
    mockSupabaseFrom.mockReturnValue(builder)

    const result = await getAuditLogUsers()
    if (!Array.isArray(result)) throw new Error(result.error)

    expect(result).toEqual(["ana@lab.com", "bob@lab.com"])
  })

  it("scopes query to the caller's org and filters out null emails", async () => {
    const builder = makeBuilder({ data: [], count: 0 })
    mockSupabaseFrom.mockReturnValue(builder)

    await getAuditLogUsers()

    const cap = (builder as { __capture: Capture }).__capture
    expect(cap.eqs["organisation_id"]).toBe("org-1")
    expect(cap.notNull).toContain("user_email")
  })
})
