import { describe, it, expect } from "vitest"
import { redactForLog } from "@/lib/redact"

describe("redactForLog", () => {
  it("returns empty string for null or undefined", () => {
    expect(redactForLog(null)).toBe("")
    expect(redactForLog(undefined)).toBe("")
  })

  it("returns empty string for the empty string", () => {
    expect(redactForLog("")).toBe("")
  })

  it("passes through a clean message unchanged", () => {
    expect(redactForLog("AADSTS50011: invalid redirect")).toBe("AADSTS50011: invalid redirect")
  })

  it("replaces email addresses with a placeholder", () => {
    const msg = "AADSTS700016: The application is not configured for ana.lopez@art-fertility.es"
    expect(redactForLog(msg)).not.toMatch(/ana\.lopez/)
    expect(redactForLog(msg)).toMatch(/<redacted-email>/)
  })

  it("replaces multiple emails in the same string", () => {
    const msg = "Conflict between alice@x.com and bob@y.org"
    const out = redactForLog(msg)
    expect(out).not.toMatch(/alice/)
    expect(out).not.toMatch(/bob/)
    expect(out.match(/<redacted-email>/g)?.length).toBe(2)
  })

  it("truncates to 200 chars by default", () => {
    const msg = "x".repeat(500)
    expect(redactForLog(msg).length).toBe(200)
  })

  it("respects a custom max length", () => {
    expect(redactForLog("abcdefghij", 4)).toBe("abcd")
  })

  it("handles plus-addressing and subdomains in emails", () => {
    const msg = "error for user+tag@mail.corp.example.co.uk"
    expect(redactForLog(msg)).not.toMatch(/user\+tag/)
    expect(redactForLog(msg)).toMatch(/<redacted-email>/)
  })
})
