import { describe, it, expect, beforeEach, vi } from "vitest"

// ── Minimal DOM / storage stubs ───────────────────────────────────────────────

type StyleBag = {
  props: Map<string, string>
  fontSize: string
  zoom: string
  colorScheme: string
  setProperty(k: string, v: string): void
  removeProperty(k: string): void
}

function makeStyle(): StyleBag {
  const props = new Map<string, string>()
  return {
    props,
    fontSize: "",
    zoom: "",
    colorScheme: "",
    setProperty(k, v) { props.set(k, v) },
    removeProperty(k) { props.delete(k) },
  }
}

let attrs: Map<string, string>
let style: StyleBag
let storage: Map<string, string>
let cookieStore: string
let prefersDarkMatch: boolean

beforeEach(async () => {
  attrs = new Map()
  style = makeStyle()
  storage = new Map()
  cookieStore = ""
  prefersDarkMatch = false

  vi.stubGlobal("document", {
    documentElement: {
      style,
      setAttribute(k: string, v: string) { attrs.set(k, v) },
      removeAttribute(k: string) { attrs.delete(k) },
    },
    get cookie() { return cookieStore },
    set cookie(v: string) { cookieStore = v },
  })
  vi.stubGlobal("localStorage", {
    setItem(k: string, v: string) { storage.set(k, v) },
    getItem(k: string) { return storage.get(k) ?? null },
  })
  vi.stubGlobal("window", {
    matchMedia: (_q: string) => ({ matches: prefersDarkMatch }),
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("applyTheme — dark", () => {
  it("sets data-theme=dark and colorScheme=dark", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    applyTheme({ theme: "dark" })
    expect(attrs.get("data-theme")).toBe("dark")
    expect(style.colorScheme).toBe("dark")
  })

  it("persists cookie + localStorage", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    applyTheme({ theme: "dark", accentColor: "#abcdef" })
    expect(storage.get("labrota_theme")).toContain('"theme":"dark"')
    expect(storage.get("labrota_theme")).toContain('"accentColor":"#abcdef"')
    expect(cookieStore).toContain("labrota_theme=")
    expect(cookieStore).toContain("path=/")
    expect(cookieStore).toContain("SameSite=Lax")
  })
})

describe("applyTheme — light", () => {
  it("removes data-theme and sets colorScheme=light", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    attrs.set("data-theme", "dark")
    applyTheme({ theme: "light" })
    expect(attrs.has("data-theme")).toBe(false)
    expect(style.colorScheme).toBe("light")
  })
})

describe("applyTheme — auto", () => {
  it("follows system dark preference", async () => {
    prefersDarkMatch = true
    const { applyTheme } = await import("@/lib/apply-theme")
    applyTheme({ theme: "auto" })
    expect(attrs.get("data-theme")).toBe("dark")
    expect(style.colorScheme).toBe("dark")
  })

  it("follows system light preference", async () => {
    prefersDarkMatch = false
    const { applyTheme } = await import("@/lib/apply-theme")
    attrs.set("data-theme", "dark")
    applyTheme({ theme: "auto" })
    expect(attrs.has("data-theme")).toBe(false)
    expect(style.colorScheme).toBe("light")
  })
})

describe("applyTheme — accent color", () => {
  it("writes --primary, --ring, --sidebar-primary, --sidebar-ring, --header-bg", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    applyTheme({ theme: "light", accentColor: "#ff0088" })
    expect(style.props.get("--primary")).toBe("#ff0088")
    expect(style.props.get("--ring")).toBe("#ff0088")
    expect(style.props.get("--sidebar-primary")).toBe("#ff0088")
    expect(style.props.get("--sidebar-ring")).toBe("#ff0088")
    expect(style.props.get("--header-bg")).toBe("#ff0088")
  })

  it("does nothing when accentColor is absent", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    applyTheme({ theme: "light" })
    expect(style.props.has("--primary")).toBe(false)
  })
})

describe("applyTheme — fontScale", () => {
  it("s scales down to 0.9", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    applyTheme({ theme: "light", fontScale: "s" })
    expect(style.props.get("--font-scale")).toBe("0.9")
    expect(style.fontSize).toBe("calc(14px * 0.9)")
  })

  it("l scales up to 1.1", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    applyTheme({ theme: "light", fontScale: "l" })
    expect(style.props.get("--font-scale")).toBe("1.1")
    expect(style.fontSize).toBe("calc(14px * 1.1)")
  })

  it("m clears --font-scale and fontSize", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    style.props.set("--font-scale", "1.1")
    style.fontSize = "calc(14px * 1.1)"
    applyTheme({ theme: "light", fontScale: "m" })
    expect(style.props.has("--font-scale")).toBe(false)
    expect(style.fontSize).toBe("")
  })

  it("undefined fontScale clears --font-scale and fontSize", async () => {
    const { applyTheme } = await import("@/lib/apply-theme")
    style.props.set("--font-scale", "0.9")
    style.fontSize = "calc(14px * 0.9)"
    applyTheme({ theme: "light" })
    expect(style.props.has("--font-scale")).toBe(false)
    expect(style.fontSize).toBe("")
  })
})
