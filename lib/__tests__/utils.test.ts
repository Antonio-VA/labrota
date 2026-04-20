import { describe, it, expect } from "vitest"
import { getInitials, generateSlug } from "@/lib/utils"

describe("getInitials", () => {
  it("returns null for null / undefined / empty / whitespace", () => {
    expect(getInitials(null)).toBeNull()
    expect(getInitials(undefined)).toBeNull()
    expect(getInitials("")).toBeNull()
    expect(getInitials("   ")).toBeNull()
    expect(getInitials("\t\n")).toBeNull()
  })

  it("uses first letter of a single word", () => {
    expect(getInitials("Antonio")).toBe("A")
  })

  it("uses first two words' first letters", () => {
    expect(getInitials("Antonio Valera")).toBe("AV")
  })

  it("caps at the first two words when more are given", () => {
    expect(getInitials("Maria del Carmen Sanchez")).toBe("MD")
  })

  it("uppercases lowercase input", () => {
    expect(getInitials("ana maria")).toBe("AM")
  })

  it("collapses multiple whitespace between words", () => {
    expect(getInitials("Ana   Maria")).toBe("AM")
    expect(getInitials("  Ana  Maria  ")).toBe("AM")
  })

  it("preserves accented characters", () => {
    expect(getInitials("Álvaro Écija")).toBe("ÁÉ")
  })
})

describe("generateSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(generateSlug("My Lab")).toBe("my-lab")
  })

  it("strips accents", () => {
    expect(generateSlug("Clínica Álava")).toBe("clinica-alava")
  })

  it("strips leading and trailing hyphens", () => {
    expect(generateSlug("  --hello--  ")).toBe("hello")
  })
})
