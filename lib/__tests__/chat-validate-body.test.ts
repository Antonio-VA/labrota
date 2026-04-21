import { describe, it, expect } from "vitest"
import { validateChatBody, CHAT_LIMITS } from "@/app/api/chat/_lib/validate-body"

const OK_MESSAGE = { role: "user", parts: [{ type: "text", text: "hi" }] }

describe("validateChatBody", () => {
  it("accepts a well-formed body with messages", () => {
    const r = validateChatBody({ messages: [OK_MESSAGE] })
    if (!r.ok) throw new Error(r.error)
    expect(r.messages).toHaveLength(1)
    expect(r.viewingWeekStart).toBeUndefined()
    expect(r.currentPage).toBeUndefined()
  })

  it("passes through string viewingWeekStart and currentPage", () => {
    const r = validateChatBody({
      messages: [OK_MESSAGE],
      viewingWeekStart: "2026-04-20",
      currentPage: "/schedule",
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.viewingWeekStart).toBe("2026-04-20")
    expect(r.currentPage).toBe("/schedule")
  })

  it("discards non-string viewingWeekStart / currentPage instead of surfacing them", () => {
    const r = validateChatBody({
      messages: [OK_MESSAGE],
      viewingWeekStart: 12345,
      currentPage: { href: "/x" },
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.viewingWeekStart).toBeUndefined()
    expect(r.currentPage).toBeUndefined()
  })

  describe("rejects malformed bodies", () => {
    it("null body", () => {
      const r = validateChatBody(null)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/object/)
    })
    it("string body", () => {
      const r = validateChatBody("not an object")
      expect(r.ok).toBe(false)
    })
    it("missing messages", () => {
      const r = validateChatBody({})
      if (r.ok) throw new Error("should have failed")
      expect(r.error).toMatch(/array/)
    })
    it("messages is not an array", () => {
      const r = validateChatBody({ messages: "hello" })
      if (r.ok) throw new Error("should have failed")
      expect(r.error).toMatch(/array/)
    })
    it("messages is empty", () => {
      const r = validateChatBody({ messages: [] })
      if (r.ok) throw new Error("should have failed")
      expect(r.error).toMatch(/empty/)
    })
  })

  describe("enforces size limits", () => {
    it("rejects more than MAX_MESSAGES", () => {
      const many = Array.from({ length: CHAT_LIMITS.MAX_MESSAGES + 1 }, () => OK_MESSAGE)
      const r = validateChatBody({ messages: many })
      if (r.ok) throw new Error("should have failed")
      expect(r.error).toMatch(/Too many messages/)
    })

    it("rejects a single oversized message", () => {
      const huge = {
        role: "user",
        parts: [{ type: "text", text: "x".repeat(CHAT_LIMITS.MAX_MESSAGE_CHARS + 10) }],
      }
      const r = validateChatBody({ messages: [huge] })
      if (r.ok) throw new Error("should have failed")
      expect(r.error).toMatch(/Message too large/)
    })

    it("rejects a conversation that exceeds MAX_TOTAL_CHARS in aggregate", () => {
      // Messages just under the per-message cap, summing over the total cap.
      const big = {
        role: "user",
        parts: [{ type: "text", text: "y".repeat(CHAT_LIMITS.MAX_MESSAGE_CHARS - 100) }],
      }
      const n = Math.ceil(CHAT_LIMITS.MAX_TOTAL_CHARS / CHAT_LIMITS.MAX_MESSAGE_CHARS) + 1
      const r = validateChatBody({ messages: Array.from({ length: n }, () => big) })
      if (r.ok) throw new Error("should have failed")
      expect(r.error).toMatch(/Conversation too large/)
    })

    it("accepts MAX_MESSAGES messages of a reasonable size", () => {
      const messages = Array.from({ length: CHAT_LIMITS.MAX_MESSAGES }, (_, i) => ({
        role: "user",
        parts: [{ type: "text", text: `short ${i}` }],
      }))
      const r = validateChatBody({ messages })
      expect(r.ok).toBe(true)
    })
  })
})
