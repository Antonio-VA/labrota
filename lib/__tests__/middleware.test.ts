import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockUser: { id?: string; app_metadata?: { role?: string } } | null = null
let mockProfileData: { preferences?: Record<string, unknown>; preferences_updated_at?: string } | null = null

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockProfileData }),
        }),
      }),
    }),
  }),
}))

const mockRedirect = vi.fn()
const mockRewrite = vi.fn()
const mockNext = vi.fn()

class MockCookies {
  private store = new Map<string, string>()
  private deleted = new Set<string>()
  getAll() { return [...this.store.entries()].map(([name, value]) => ({ name, value })) }
  set(name: string, value: string) { this.store.set(name, value); this.deleted.delete(name) }
  get(name: string) { return this.store.has(name) ? { name, value: this.store.get(name)! } : undefined }
  has(name: string) { return this.store.has(name) }
  delete(name: string) { this.store.delete(name); this.deleted.add(name) }
  wasDeleted(name: string) { return this.deleted.has(name) }
}

class MockNextResponse {
  cookies = new MockCookies()
  static next({ request }: { request: unknown }) {
    const r = new MockNextResponse()
    mockNext(request)
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

function createRequest(pathname: string, host = "labrota.app", cookies?: Record<string, string>): unknown {
  const url = `https://${host}${pathname}`
  const reqCookies = new MockCookies()
  if (cookies) for (const [name, value] of Object.entries(cookies)) reqCookies.set(name, value)
  return {
    cookies: reqCookies,
    nextUrl: {
      pathname,
      searchParams: new URLSearchParams(),
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

async function runMiddleware(pathname: string, host?: string, cookies?: Record<string, string>) {
  mockRedirect.mockClear()
  mockRewrite.mockClear()
  mockNext.mockClear()
  const { middleware } = await import("@/middleware")
  return middleware(createRequest(pathname, host, cookies) as Parameters<typeof middleware>[0])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUser = null
  mockProfileData = null
  mockRedirect.mockClear()
  mockRewrite.mockClear()
  mockNext.mockClear()
})

describe("middleware — public paths (no auth required)", () => {
  it("allows /auth paths through", async () => {
    await runMiddleware("/auth/callback")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows /brand paths through", async () => {
    await runMiddleware("/brand/logo.svg")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows /api/outlook-callback through without PKCE redirect", async () => {
    mockUser = null
    await runMiddleware("/api/outlook-callback?code=test&state=xyz")
    // Should NOT redirect to /auth/callback (PKCE) — the ?code= is for Microsoft OAuth
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

  it("allows /demo through", async () => {
    await runMiddleware("/demo")
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

describe("middleware — /login", () => {
  it("shows login page to unauthenticated users", async () => {
    mockUser = null
    await runMiddleware("/login")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("redirects authenticated regular user to /schedule", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/login")
    expect(mockRedirect).toHaveBeenCalledWith("/schedule")
  })

  it("redirects super_admin to /admin", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/login")
    expect(mockRedirect).toHaveBeenCalledWith("/admin")
  })
})

describe("middleware — marketing home (/)", () => {
  it("shows landing page to unauthenticated users", async () => {
    mockUser = null
    await runMiddleware("/")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("redirects regular user to /schedule", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/")
    expect(mockRedirect).toHaveBeenCalledWith("/schedule")
  })

  it("redirects super_admin to /admin", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/")
    expect(mockRedirect).toHaveBeenCalledWith("/admin")
  })
})

describe("middleware — clinic routes (unauthenticated)", () => {
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

  it("redirects unauthenticated user to /login on /schedule", async () => {
    mockUser = null
    await runMiddleware("/schedule")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })
})

describe("middleware — clinic routes (authenticated)", () => {
  it("allows regular user through to /staff", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/staff")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("allows regular user through to /schedule", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/schedule")
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("redirects super_admin away from clinic to /admin", async () => {
    mockUser = { app_metadata: { role: "super_admin" } }
    await runMiddleware("/staff")
    expect(mockRedirect).toHaveBeenCalledWith("/admin")
  })
})

describe("middleware — /admin/* routes (direct access)", () => {
  it("redirects unauthenticated user to /login", async () => {
    mockUser = null
    await runMiddleware("/admin")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("redirects regular user to /schedule (not authorized)", async () => {
    mockUser = { app_metadata: { role: "member" } }
    await runMiddleware("/admin")
    expect(mockRedirect).toHaveBeenCalledWith("/schedule")
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

describe("middleware — preferences sync (timestamp-based DB → cookies)", () => {
  const TS1 = "2026-04-20T10:00:00.000Z"
  const TS2 = "2026-04-20T11:00:00.000Z"

  it("writes labrota_theme and labrota_prefs_ts cookies when ts cookie is missing", async () => {
    mockUser = { id: "u1", app_metadata: { role: "member" } }
    mockProfileData = { preferences: { theme: "dark", accentColor: "#abcdef" }, preferences_updated_at: TS1 }
    const res = (await runMiddleware("/schedule")) as unknown as MockNextResponse
    const cookie = res.cookies.get("labrota_theme")
    expect(cookie?.value).toContain('"theme":"dark"')
    expect(cookie?.value).toContain('"accentColor":"#abcdef"')
    expect(res.cookies.get("labrota_prefs_ts")?.value).toBe(TS1)
  })

  it("writes locale cookie when user chose one explicitly", async () => {
    mockUser = { id: "u1", app_metadata: { role: "member" } }
    mockProfileData = { preferences: { locale: "en" }, preferences_updated_at: TS1 }
    const res = (await runMiddleware("/schedule")) as unknown as MockNextResponse
    expect(res.cookies.get("locale")?.value).toBe("en")
  })

  it("deletes locale cookie when user switched to 'browser'", async () => {
    mockUser = { id: "u1", app_metadata: { role: "member" } }
    mockProfileData = { preferences: { locale: "browser" }, preferences_updated_at: TS1 }
    const res = (await runMiddleware("/schedule", undefined, { locale: "en" })) as unknown as MockNextResponse
    expect(res.cookies.wasDeleted("locale")).toBe(true)
  })

  it("does not touch cookies when ts matches (same device, already synced)", async () => {
    mockUser = { id: "u1", app_metadata: { role: "member" } }
    mockProfileData = { preferences: { theme: "dark" }, preferences_updated_at: TS1 }
    const res = (await runMiddleware("/schedule", undefined, { labrota_prefs_ts: TS1 })) as unknown as MockNextResponse
    expect(res.cookies.get("labrota_theme")).toBeUndefined()
    expect(res.cookies.get("labrota_prefs_ts")).toBeUndefined()
  })

  it("refreshes cookies when DB ts is newer than cookie ts (multi-device sync)", async () => {
    mockUser = { id: "u1", app_metadata: { role: "member" } }
    mockProfileData = { preferences: { theme: "light" }, preferences_updated_at: TS2 }
    const res = (await runMiddleware("/schedule", undefined, { labrota_prefs_ts: TS1 })) as unknown as MockNextResponse
    expect(res.cookies.get("labrota_theme")?.value).toContain('"theme":"light"')
    expect(res.cookies.get("labrota_prefs_ts")?.value).toBe(TS2)
  })

  it("does not query prefs for super_admin", async () => {
    mockUser = { id: "u1", app_metadata: { role: "super_admin" } }
    mockProfileData = { preferences: { theme: "dark" }, preferences_updated_at: TS1 }
    const res = (await runMiddleware("/admin")) as unknown as MockNextResponse
    expect(res.cookies.get("labrota_theme")).toBeUndefined()
    expect(res.cookies.get("labrota_prefs_ts")).toBeUndefined()
  })

  it("deletes labrota_theme when preferences have no theme fields", async () => {
    mockUser = { id: "u1", app_metadata: { role: "member" } }
    mockProfileData = { preferences: { locale: "en" }, preferences_updated_at: TS1 }
    const res = (await runMiddleware("/schedule", undefined, { labrota_theme: "{\"theme\":\"dark\"}" })) as unknown as MockNextResponse
    expect(res.cookies.wasDeleted("labrota_theme")).toBe(true)
  })

  it("skips DB read entirely when TTL cookie is fresh", async () => {
    mockUser = { id: "u1", app_metadata: { role: "member" } }
    mockProfileData = { preferences: { theme: "dark" }, preferences_updated_at: TS2 }
    const futureTtl = String(Date.now() + 60_000)
    const res = (await runMiddleware("/schedule", undefined, {
      labrota_prefs_ttl: futureTtl,
      labrota_prefs_ts: TS1,
    })) as unknown as MockNextResponse
    // No sync work runs, so neither theme nor ts cookie gets written
    expect(res.cookies.get("labrota_theme")).toBeUndefined()
    expect(res.cookies.get("labrota_prefs_ts")).toBeUndefined()
    expect(res.cookies.get("labrota_prefs_ttl")).toBeUndefined()
  })

  it("writes labrota_prefs_ttl after a sync pass", async () => {
    mockUser = { id: "u1", app_metadata: { role: "member" } }
    mockProfileData = { preferences: { theme: "dark" }, preferences_updated_at: TS1 }
    const res = (await runMiddleware("/schedule")) as unknown as MockNextResponse
    const ttl = res.cookies.get("labrota_prefs_ttl")?.value
    expect(ttl).toBeDefined()
    expect(parseInt(ttl!, 10)).toBeGreaterThan(Date.now())
  })
})

describe("middleware — matcher config", () => {
  it("exports matcher config", async () => {
    const mod = await import("@/middleware")
    expect(mod.config).toBeDefined()
    expect(mod.config.matcher).toBeDefined()
    expect(mod.config.matcher.length).toBeGreaterThan(0)
  })
})
