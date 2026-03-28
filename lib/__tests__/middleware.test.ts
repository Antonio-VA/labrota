import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock user state for tests
let mockUser: { app_metadata?: { role?: string } } | null = null

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
  }),
}))

// Capture NextResponse calls
const mockRedirect = vi.fn()
const mockRewrite = vi.fn()
const mockNextResponse = vi.fn()

class MockCookies {
  private store = new Map<string, string>()
  getAll() { return [...this.store.entries()].map(([name, value]) => ({ name, value })) }
  set(name: string, value: string) { this.store.set(name, value) }
  get(name: string) { return this.store.has(name) ? { name, value: this.store.get(name)! } : undefined }
}

class MockNextResponse {
  cookies = new MockCookies()
  static next({ request }: { request: unknown }) {
    const r = new MockNextResponse()
    mockNextResponse(request)
    return r
  }
  static redirect(url: URL) {
    const r = new MockNextResponse()
    mockRedirect(url.pathname)
    return r
  }
  static rewrite(url: URL) {
    const r = new MockNextResponse()
    mockRewrite(url.pathname)
    return r
  }
}

vi.mock("next/server", () => ({
  NextResponse: MockNextResponse,
}))

// ── Helper ────────────────────────────────────────────────────────────────────

function createRequest(pathname: string, host = "labrota.app"): unknown {
  const url = `https://${host}${pathname}`
  return {
    cookies: new MockCookies(),
    nextUrl: {
      pathname,
      clone() {
        return { pathname, toString: () => url }
      },
    },
    url,
    headers: {
      get(name: string) {
        if (name === "host") return host
        return null
      },
    },
  }
}

// ── Import middleware after mocks ──────────────────────────────────────────────

// We need to dynamically import to ensure mocks are in place
async function runMiddleware(pathname: string, host?: string) {
  // Reset mocks before each call
  mockRedirect.mockClear()
  mockRewrite.mockClear()
  mockNextResponse.mockClear()
  const { middleware } = await import("@/middleware")
  return middleware(createRequest(pathname, host) as Parameters<typeof middleware>[0])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUser = null
  mockRedirect.mockClear()
  mockRewrite.mockClear()
  mockNextResponse.mockClear()
})

describe("middleware — public paths (no auth required)", () => {
  it("allows /auth paths through", async () => {
    await runMiddleware("/auth/callback")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows /_next paths through", async () => {
    await runMiddleware("/_next/static/chunk.js")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows /brand paths through", async () => {
    await runMiddleware("/brand/logo.svg")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows /forgot-password through", async () => {
    await runMiddleware("/forgot-password")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows /reset-password through", async () => {
    await runMiddleware("/reset-password")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows /set-password through", async () => {
    await runMiddleware("/set-password")
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

describe("middleware — /login", () => {
  it("shows login page to unauthenticated users", async () => {
    mockUser = null
    await runMiddleware("/login")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("redirects authenticated regular user to /", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/login")
    expect(mockRedirect).toHaveBeenCalledWith("/")
  })

  it("redirects super_admin to /admin", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/login")
    expect(mockRedirect).toHaveBeenCalledWith("/admin")
  })
})

describe("middleware — clinic routes (unauthenticated)", () => {
  it("redirects unauthenticated user to /login on /", async () => {
    mockUser = null
    await runMiddleware("/")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("redirects unauthenticated user to /login on /staff", async () => {
    mockUser = null
    await runMiddleware("/staff")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("redirects unauthenticated user to /login on /leaves", async () => {
    mockUser = null
    await runMiddleware("/leaves")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })
})

describe("middleware — clinic routes (authenticated)", () => {
  it("allows regular user through to /", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows regular user through to /staff", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/staff")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("redirects super_admin away from clinic to /admin", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/")
    expect(mockRedirect).toHaveBeenCalledWith("/admin")
  })
})

describe("middleware — /admin/* routes (direct access)", () => {
  it("redirects unauthenticated user to /login", async () => {
    mockUser = null
    await runMiddleware("/admin")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("redirects regular user to / (not authorized)", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/admin")
    expect(mockRedirect).toHaveBeenCalledWith("/")
  })

  it("allows super_admin through to /admin", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/admin")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows super_admin through to /admin/orgs/new", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/admin/orgs/new")
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

describe("middleware — admin subdomain", () => {
  it("allows /login on admin subdomain without auth", async () => {
    mockUser = null
    await runMiddleware("/login", "admin.labrota.app")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows /auth paths on admin subdomain", async () => {
    mockUser = null
    await runMiddleware("/auth/callback", "admin.labrota.app")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("redirects unauthenticated to /login on admin subdomain", async () => {
    mockUser = null
    await runMiddleware("/", "admin.labrota.app")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("redirects non-super_admin to /login on admin subdomain", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/", "admin.labrota.app")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("rewrites / to /admin for super_admin on admin subdomain", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/", "admin.labrota.app")
    expect(mockRewrite).toHaveBeenCalledWith("/admin")
  })

  it("rewrites /orgs/new to /admin/orgs/new on admin subdomain", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/orgs/new", "admin.labrota.app")
    expect(mockRewrite).toHaveBeenCalledWith("/admin/orgs/new")
  })

  it("does not double-prefix /admin paths on admin subdomain", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/admin/orgs", "admin.labrota.app")
    expect(mockRewrite).toHaveBeenCalledWith("/admin/orgs")
  })

  it("works with admin.localhost subdomain", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/", "admin.localhost:3000")
    expect(mockRewrite).toHaveBeenCalledWith("/admin")
  })
})

describe("middleware — matcher config", () => {
  // The matcher is exported from the module
  it("exports matcher config", async () => {
    const mod = await import("@/middleware")
    expect(mod.config).toBeDefined()
    expect(mod.config.matcher).toBeDefined()
    expect(mod.config.matcher.length).toBeGreaterThan(0)
  })
})
