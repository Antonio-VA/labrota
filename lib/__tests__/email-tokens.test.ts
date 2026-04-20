import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHmac } from "crypto"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next/server", () => ({
  NextRequest: class {
    nextUrl: URL
    headers = new Headers()
    constructor(url: string) { this.nextUrl = new URL(url) }
  },
  NextResponse: class {
    constructor(public body: string, public init?: ResponseInit) {}
    get status() { return this.init?.status ?? 200 }
  },
}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  rateLimitResponse: vi.fn(),
}))
vi.mock("@/lib/leaves/clear-rota-assignments", () => ({ clearRotaAssignmentsForLeave: vi.fn() }))
vi.mock("@/app/(clinic)/leaves/emails", () => ({ notifyLeaveDecision: vi.fn() }))
vi.mock("@/lib/swap-email", () => ({
  resendRotaWithSwapNotice: vi.fn(),
  sendSwapTargetEmail: vi.fn(),
  notifySwapTarget: vi.fn(),
  notifySwapInitiator: vi.fn(),
}))

// ── Imports after mocks ────────────────────────────────────────────────────────

const { signLeaveAction } = await import("@/app/api/leave-action/route")
const { signSwapAction } = await import("@/app/api/swap-action/route")

const LEAVE_SECRET = "test-leave-secret-at-least-32-chars!!!"
const SWAP_SECRET  = "test-swap-secret-at-least-32-chars!!!!"

// ── signLeaveAction ────────────────────────────────────────────────────────────

describe("signLeaveAction", () => {
  beforeEach(() => { process.env.LEAVE_TOKEN_SECRET = LEAVE_SECRET })
  afterEach(() => { delete process.env.LEAVE_TOKEN_SECRET })

  it("throws when LEAVE_TOKEN_SECRET is not set", () => {
    delete process.env.LEAVE_TOKEN_SECRET
    expect(() => signLeaveAction("leave-1", "approve")).toThrow("LEAVE_TOKEN_SECRET")
  })

  it("returns a token in format {expires}.{hex64}", () => {
    const token = signLeaveAction("leave-1", "approve")
    const [expStr, hex] = token.split(".")
    expect(Number(expStr)).toBeGreaterThan(Date.now())
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
  })

  it("signature matches independent HMAC-SHA256 computation", () => {
    const token = signLeaveAction("leave-abc", "reject")
    const dot = token.indexOf(".")
    const expires = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = createHmac("sha256", LEAVE_SECRET)
      .update(`leave-abc:reject:${expires}`)
      .digest("hex")
    expect(sig).toBe(expected)
  })

  it("different leaveId produces a different signature", () => {
    const t1 = signLeaveAction("leave-1", "approve")
    const t2 = signLeaveAction("leave-2", "approve")
    expect(t1.split(".")[1]).not.toBe(t2.split(".")[1])
  })

  it("different action produces a different signature", () => {
    const t1 = signLeaveAction("leave-1", "approve")
    const t2 = signLeaveAction("leave-1", "reject")
    expect(t1.split(".")[1]).not.toBe(t2.split(".")[1])
  })

  it("signature cannot be forged with a different key", () => {
    const token = signLeaveAction("leave-1", "approve")
    const dot = token.indexOf(".")
    const expires = token.slice(0, dot)
    const forgery = createHmac("sha256", "wrong-key")
      .update(`leave-1:approve:${expires}`)
      .digest("hex")
    expect(forgery).not.toBe(token.slice(dot + 1))
  })

  it("expires approximately 7 days from now", () => {
    const before = Date.now()
    const token = signLeaveAction("leave-1", "approve")
    const expires = Number(token.split(".")[0])
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    expect(expires - before).toBeGreaterThan(sevenDays - 5_000)
    expect(expires - before).toBeLessThan(sevenDays + 5_000)
  })
})

// ── signSwapAction ─────────────────────────────────────────────────────────────

describe("signSwapAction", () => {
  beforeEach(() => { process.env.SWAP_TOKEN_SECRET = SWAP_SECRET })
  afterEach(() => { delete process.env.SWAP_TOKEN_SECRET })

  it("throws when SWAP_TOKEN_SECRET is not set", () => {
    delete process.env.SWAP_TOKEN_SECRET
    expect(() => signSwapAction("swap-1", "approve", "manager")).toThrow("SWAP_TOKEN_SECRET")
  })

  it("returns a token in format {expires}.{hex64}", () => {
    const token = signSwapAction("swap-1", "approve", "manager")
    const [expStr, hex] = token.split(".")
    expect(Number(expStr)).toBeGreaterThan(Date.now())
    expect(hex).toHaveLength(64)
  })

  it("signature matches independent HMAC-SHA256 computation", () => {
    const token = signSwapAction("swap-xyz", "reject", "target")
    const dot = token.indexOf(".")
    const expires = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = createHmac("sha256", SWAP_SECRET)
      .update(`swap-xyz:reject:target:${expires}`)
      .digest("hex")
    expect(sig).toBe(expected)
  })

  it("different step produces a different signature", () => {
    const t1 = signSwapAction("swap-1", "approve", "manager")
    const t2 = signSwapAction("swap-1", "approve", "target")
    expect(t1.split(".")[1]).not.toBe(t2.split(".")[1])
  })

  it("different action produces a different signature", () => {
    const t1 = signSwapAction("swap-1", "approve", "manager")
    const t2 = signSwapAction("swap-1", "reject", "manager")
    expect(t1.split(".")[1]).not.toBe(t2.split(".")[1])
  })

  it("signature cannot be forged with a different key", () => {
    const token = signSwapAction("swap-1", "approve", "target")
    const dot = token.indexOf(".")
    const expires = token.slice(0, dot)
    const forgery = createHmac("sha256", "wrong-key")
      .update(`swap-1:approve:target:${expires}`)
      .digest("hex")
    expect(forgery).not.toBe(token.slice(dot + 1))
  })
})
