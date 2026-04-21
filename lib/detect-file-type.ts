/**
 * Magic-byte detector for the file formats accepted by `/api/import-extract`
 * and `/api/import-rota-extract`. Used as a server-side check on top of the
 * client-declared `mediaType` — `file.type` / `mediaType` is trivially
 * spoofable (it comes from the browser's File object, which the attacker
 * can craft freely), so we must sniff the actual bytes before handing any
 * payload to the AI model.
 *
 * Only four formats are accepted; a full magic-byte table like `file-type`
 * would be overkill.
 */

export type DetectedMime =
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "image/webp"

const PDF_MAGIC = Buffer.from("%PDF-", "ascii")
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
// WebP: "RIFF" [4 size bytes] "WEBP"
const WEBP_RIFF = Buffer.from("RIFF", "ascii")
const WEBP_TAG = Buffer.from("WEBP", "ascii")

/**
 * Returns the detected MIME type from the first bytes of a buffer, or null
 * if the bytes don't match any of the accepted formats.
 */
export function detectFileType(buf: Buffer): DetectedMime | null {
  if (buf.length >= PDF_MAGIC.length && buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return "application/pdf"
  }
  if (buf.length >= PNG_MAGIC.length && buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return "image/png"
  }
  if (buf.length >= JPEG_MAGIC.length && buf.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    return "image/jpeg"
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).equals(WEBP_RIFF) &&
    buf.subarray(8, 12).equals(WEBP_TAG)
  ) {
    return "image/webp"
  }
  return null
}

/**
 * Decodes the first N bytes of a base64 string into a Buffer. Only reads
 * enough bytes to cover every magic header we look for (currently 12).
 * Returns null if the input is too short or malformed.
 */
export function detectFromBase64(base64: string, header = 16): DetectedMime | null {
  // 4 base64 chars = 3 bytes, so slice enough of the prefix to decode `header` bytes.
  const prefixChars = Math.ceil((header / 3) * 4) + 4
  try {
    const buf = Buffer.from(base64.slice(0, prefixChars), "base64")
    return detectFileType(buf)
  } catch {
    return null
  }
}
