import { describe, it, expect } from "vitest"
import { detectFileType, detectFromBase64 } from "@/lib/detect-file-type"

// ── Sample magic-byte prefixes ───────────────────────────────────────────────

const PDF = Buffer.from("%PDF-1.4\n…", "binary")
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
// WebP needs RIFF + 4 size bytes + WEBP
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.from([0x56, 0x50]),
])

// ── detectFileType ───────────────────────────────────────────────────────────

describe("detectFileType", () => {
  it("identifies PDF", () => {
    expect(detectFileType(PDF)).toBe("application/pdf")
  })
  it("identifies PNG", () => {
    expect(detectFileType(PNG)).toBe("image/png")
  })
  it("identifies JPEG", () => {
    expect(detectFileType(JPEG)).toBe("image/jpeg")
  })
  it("identifies WebP", () => {
    expect(detectFileType(WEBP)).toBe("image/webp")
  })

  it("returns null for a buffer that doesn't match any known format", () => {
    expect(detectFileType(Buffer.from("not a real file", "utf8"))).toBeNull()
  })

  it("returns null for an empty buffer", () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull()
  })

  it("does not mistake RIFF without WEBP tag as WebP (guards against WAV/AVI)", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WAVE", "ascii"),
    ])
    expect(detectFileType(wav)).toBeNull()
  })

  it("does not match a PNG signature that is only partially present", () => {
    // Only the first 4 bytes of the 8-byte signature.
    const short = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    expect(detectFileType(short)).toBeNull()
  })
})

// ── detectFromBase64 ─────────────────────────────────────────────────────────

describe("detectFromBase64", () => {
  it("round-trips PDF through base64", () => {
    expect(detectFromBase64(PDF.toString("base64"))).toBe("application/pdf")
  })
  it("round-trips PNG through base64", () => {
    expect(detectFromBase64(PNG.toString("base64"))).toBe("image/png")
  })
  it("round-trips JPEG through base64", () => {
    expect(detectFromBase64(JPEG.toString("base64"))).toBe("image/jpeg")
  })
  it("round-trips WebP through base64", () => {
    expect(detectFromBase64(WEBP.toString("base64"))).toBe("image/webp")
  })

  it("rejects a base64 payload whose actual bytes aren't one of the accepted formats", () => {
    // Attacker case: a `.pdf.exe` sent with mediaType: 'application/pdf'.
    const payload = Buffer.from("MZ\x90\x00 (fake PE header)", "binary").toString("base64")
    expect(detectFromBase64(payload)).toBeNull()
  })

  it("returns null for malformed base64", () => {
    // `!` is outside the base64 alphabet; Buffer.from is lenient but the
    // decoded bytes won't match any magic.
    expect(detectFromBase64("!!!!!!!")).toBeNull()
  })

  it("only needs the first ~16 bytes to decide — works with a short prefix", () => {
    const b64 = PDF.slice(0, 8).toString("base64")
    expect(detectFromBase64(b64)).toBe("application/pdf")
  })
})
