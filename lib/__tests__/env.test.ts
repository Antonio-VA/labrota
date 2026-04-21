import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// The module caches nothing, so we can reset env between tests freely.
vi.mock("server-only", () => ({}))

describe("lib/env", () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    // Start each test from a clean slate — tests set only the vars they care about.
    for (const k of [
      "LEAVE_TOKEN_SECRET",
      "SWAP_TOKEN_SECRET",
      "OUTLOOK_STATE_SECRET",
      "CRON_SECRET",
      "RESEND_API_KEY",
    ]) delete process.env[k]
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  describe("required getters throw with a helpful message when unset", () => {
    it("getLeaveTokenSecret", async () => {
      const { getLeaveTokenSecret } = await import("@/lib/env")
      expect(() => getLeaveTokenSecret()).toThrow(/LEAVE_TOKEN_SECRET/)
      expect(() => getLeaveTokenSecret()).toThrow(/required/)
    })

    it("getSwapTokenSecret", async () => {
      const { getSwapTokenSecret } = await import("@/lib/env")
      expect(() => getSwapTokenSecret()).toThrow(/SWAP_TOKEN_SECRET/)
    })

    it("getOutlookStateSecret", async () => {
      const { getOutlookStateSecret } = await import("@/lib/env")
      expect(() => getOutlookStateSecret()).toThrow(/OUTLOOK_STATE_SECRET/)
    })

    it("getCronSecret", async () => {
      const { getCronSecret } = await import("@/lib/env")
      expect(() => getCronSecret()).toThrow(/CRON_SECRET/)
    })
  })

  describe("required getters return the value when set", () => {
    it("getLeaveTokenSecret reads LEAVE_TOKEN_SECRET", async () => {
      process.env.LEAVE_TOKEN_SECRET = "leave-secret-x"
      const { getLeaveTokenSecret } = await import("@/lib/env")
      expect(getLeaveTokenSecret()).toBe("leave-secret-x")
    })

    it("treats whitespace-only values as missing", async () => {
      process.env.LEAVE_TOKEN_SECRET = "   "
      const { getLeaveTokenSecret } = await import("@/lib/env")
      expect(() => getLeaveTokenSecret()).toThrow(/LEAVE_TOKEN_SECRET/)
    })
  })

  describe("optional getters return undefined when unset", () => {
    it("getResendApiKey returns undefined without throwing", async () => {
      const { getResendApiKey } = await import("@/lib/env")
      expect(getResendApiKey()).toBeUndefined()
    })

    it("getResendApiKey returns the value when set", async () => {
      process.env.RESEND_API_KEY = "re_abc123"
      const { getResendApiKey } = await import("@/lib/env")
      expect(getResendApiKey()).toBe("re_abc123")
    })
  })

  it("re-reads process.env on every call (lazy, not cached)", async () => {
    const { getLeaveTokenSecret } = await import("@/lib/env")
    process.env.LEAVE_TOKEN_SECRET = "first"
    expect(getLeaveTokenSecret()).toBe("first")
    process.env.LEAVE_TOKEN_SECRET = "second"
    expect(getLeaveTokenSecret()).toBe("second")
  })
})
