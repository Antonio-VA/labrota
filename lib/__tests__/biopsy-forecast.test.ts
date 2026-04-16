import { describe, it, expect } from "vitest"
import { computeBiopsyForecast } from "../biopsy-forecast"

describe("computeBiopsyForecast", () => {
  const punctions: Record<string, number> = {
    "2026-03-12": 10, // 5 days before 2026-03-17
    "2026-03-11": 8,  // 6 days before 2026-03-17
  }
  const lookup = (d: string) => punctions[d] ?? 0

  it("computes forecast from d-5 and d-6 punctions", () => {
    // 10 * 0.5 * 0.6 + 8 * 0.5 * 0.4 = 3 + 1.6 = 4.6 → 5
    expect(computeBiopsyForecast("2026-03-17", lookup, 0.5, 0.6, 0.4)).toBe(5)
  })

  it("returns 0 when no punctions exist", () => {
    expect(computeBiopsyForecast("2026-01-01", lookup, 0.5, 0.5, 0.5)).toBe(0)
  })

  it("returns 0 when conversion rate is 0", () => {
    expect(computeBiopsyForecast("2026-03-17", lookup, 0, 0.5, 0.5)).toBe(0)
  })

  it("rounds to nearest integer", () => {
    // 10 * 0.3 * 0.5 + 8 * 0.3 * 0.5 = 1.5 + 1.2 = 2.7 → 3
    expect(computeBiopsyForecast("2026-03-17", lookup, 0.3, 0.5, 0.5)).toBe(3)
  })

  it("handles only d-5 having punctions", () => {
    const sparseData: Record<string, number> = { "2026-03-12": 10 }
    const sparseLookup = (d: string) => sparseData[d] ?? 0
    // 10 * 0.5 * 0.5 + 0 = 2.5 → 3
    expect(computeBiopsyForecast("2026-03-17", sparseLookup, 0.5, 0.5, 0.5)).toBe(3)
  })
})
