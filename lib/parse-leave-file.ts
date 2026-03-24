import * as XLSX from "xlsx"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedLeaveEntry {
  id: string
  rawStaff: string
  matchedStaffId: string | null
  matchedStaffName: string | null
  from: string   // ISO date or ""
  to: string     // ISO date or ""
  type: string
  rawText: string // original text for context
}

// ── Leave type detection ──────────────────────────────────────────────────────

const TYPE_PATTERNS: { keywords: string[]; type: string }[] = [
  { keywords: ["sick", "enferm", "baja", "ill", "médic"], type: "sick" },
  { keywords: ["training", "formacion", "formación", "curso", "workshop", "taller"], type: "training" },
  { keywords: ["maternity", "paternity", "maternidad", "paternidad"], type: "maternity" },
  { keywords: ["vacacion", "annual", "holiday", "vacation", "vacaciones"], type: "annual" },
  { keywords: ["personal", "asuntos propios"], type: "personal" },
]

function detectLeaveType(text: string): string {
  const lower = text.toLowerCase()
  for (const { keywords, type } of TYPE_PATTERNS) {
    if (keywords.some((kw) => lower.includes(kw))) return type
  }
  return "annual"
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, abr: 3, ago: 7, dic: 11,
}

function parseDate(s: string): string {
  if (!s) return ""
  const trimmed = s.trim()

  // ISO: 2026-03-24
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (dmy) {
    const d = parseInt(dmy[1], 10), m = parseInt(dmy[2], 10) - 1, y = parseInt(dmy[3], 10)
    const dt = new Date(y, m, d, 12)
    if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0]
  }

  // DD/MM (current year)
  const dmShort = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})$/)
  if (dmShort) {
    const d = parseInt(dmShort[1], 10), m = parseInt(dmShort[2], 10) - 1
    const dt = new Date(new Date().getFullYear(), m, d, 12)
    if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0]
  }

  // "24 mar 2026", "24 march 2026", "24 de marzo de 2026"
  const textDate = trimmed.match(/(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)\.?\s+(?:de\s+)?(\d{4})?/i)
  if (textDate) {
    const d = parseInt(textDate[1], 10)
    const monthName = textDate[2].toLowerCase().replace(/\.$/, "")
    const m = MONTH_MAP[monthName]
    const y = textDate[3] ? parseInt(textDate[3], 10) : new Date().getFullYear()
    if (m !== undefined) {
      const dt = new Date(y, m, d, 12)
      if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0]
    }
  }

  // "March 24, 2026"
  const enDate = trimmed.match(/([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?/i)
  if (enDate) {
    const monthName = enDate[1].toLowerCase()
    const d = parseInt(enDate[2], 10)
    const m = MONTH_MAP[monthName]
    const y = enDate[3] ? parseInt(enDate[3], 10) : new Date().getFullYear()
    if (m !== undefined) {
      const dt = new Date(y, m, d, 12)
      if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0]
    }
  }

  return ""
}

function parseDateRange(text: string): { from: string; to: string } {
  // Try common range separators: " - ", " al ", " to ", " hasta ", " – "
  const separators = [/\s*[-–]\s*/, /\s+al\s+/i, /\s+to\s+/i, /\s+hasta\s+/i, /\s+a\s+/i]

  for (const sep of separators) {
    const parts = text.split(sep)
    if (parts.length === 2) {
      const from = parseDate(parts[0].trim())
      const to = parseDate(parts[1].trim())
      if (from || to) return { from, to }
    }
  }

  // Single date
  const single = parseDate(text)
  if (single) return { from: single, to: single }

  return { from: "", to: "" }
}

// ── Staff matching ────────────────────────────────────────────────────────────

export interface StaffRecord {
  id: string
  first_name: string
  last_name: string
  initials: string
}

function matchStaff(rawName: string, staffList: StaffRecord[]): StaffRecord | null {
  const upper = rawName.trim().toUpperCase()
  const lower = rawName.trim().toLowerCase()

  // Exact initials match (2-3 chars)
  if (/^[A-Z]{2,3}$/.test(upper)) {
    const match = staffList.find((s) => s.initials === upper)
    if (match) return match
  }

  // Full name match (case-insensitive, partial)
  for (const s of staffList) {
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
    if (fullName === lower) return s
    if (fullName.includes(lower) || lower.includes(fullName)) return s
  }

  // Last name match
  for (const s of staffList) {
    if (s.last_name.toLowerCase() === lower) return s
    if (lower.includes(s.last_name.toLowerCase()) && s.last_name.length > 2) return s
  }

  // First name match (less precise)
  for (const s of staffList) {
    if (s.first_name.toLowerCase() === lower) return s
  }

  return null
}

// ── Text extraction ───────────────────────────────────────────────────────────

async function extractFromExcel(buffer: ArrayBuffer): Promise<string> {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true })
  const lines: string[] = []
  for (const name of wb.SheetNames) {
    const data: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" })
    for (const row of data) {
      const text = (row as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean).join(" | ")
      if (text) lines.push(text)
    }
  }
  return lines.join("\n")
}

async function extractFromWord(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

async function extractFromPdf(buffer: ArrayBuffer): Promise<string> {
  // Use pdfjs-dist for text extraction
  const pdfjsLib = await import("pdfjs-dist")
  // Set worker to null for Node/browser compat
  pdfjsLib.GlobalWorkerOptions.workerSrc = ""
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  const lines: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item: unknown) => (item as { str?: string }).str ?? "").join(" ")
    if (text.trim()) lines.push(text.trim())
  }
  return lines.join("\n")
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseLeaveFile(
  buffer: ArrayBuffer,
  fileName: string,
  staffList: StaffRecord[]
): Promise<{ entries: ParsedLeaveEntry[]; error?: string }> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""

  let text = ""
  try {
    if (ext === "xlsx" || ext === "xls") {
      text = await extractFromExcel(buffer)
    } else if (ext === "docx" || ext === "doc") {
      text = await extractFromWord(buffer)
    } else if (ext === "pdf") {
      text = await extractFromPdf(buffer)
    } else {
      return { entries: [], error: "Formato no compatible. Por favor sube un archivo PDF, Word o Excel." }
    }
  } catch {
    return { entries: [], error: "No se pudo leer el archivo. Por favor comprueba que no está protegido con contraseña." }
  }

  if (!text.trim()) {
    return { entries: [], error: "El archivo está vacío o no se pudo extraer texto." }
  }

  // Split text into lines and attempt to extract leave entries
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const entries: ParsedLeaveEntry[] = []
  let idCounter = 0

  for (const line of lines) {
    // Skip short lines or obvious headers
    if (line.length < 4) continue
    if (/^(name|staff|personal|fecha|date|type|tipo|from|to|desde|hasta)$/i.test(line)) continue

    // Try to find a staff name/initials and dates in the same line
    // Strategy: look for date-like patterns, then the remaining text is likely the staff name
    const datePatterns = [
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/g,
      /(\d{1,2}\s+(?:de\s+)?[a-záéíóúñ]+\.?\s+(?:de\s+)?\d{4})/gi,
      /([a-z]+\s+\d{1,2},?\s*\d{4})/gi,
      /(\d{1,2}[\/\-\.]\d{1,2})/g,
    ]

    let foundDates: string[] = []
    let remainingText = line

    for (const pattern of datePatterns) {
      const matches = [...line.matchAll(pattern)]
      if (matches.length > 0) {
        foundDates = matches.map((m) => m[1])
        remainingText = line
        for (const m of matches) {
          remainingText = remainingText.replace(m[1], "")
        }
        break
      }
    }

    // Clean remaining text — remove separators, common words
    remainingText = remainingText
      .replace(/[-–|,]/g, " ")
      .replace(/\b(from|to|al|hasta|del|de|the|a|hasta el|desde|leave|ausencia|vacaciones|annual|sick|baja)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()

    // Try to identify staff name from remaining text
    const staffCandidates = remainingText.split(/\s{2,}|\|/).map((s) => s.trim()).filter((s) => s.length >= 2)

    if (staffCandidates.length === 0 && foundDates.length === 0) continue

    const staffName = staffCandidates[0] ?? remainingText.trim()
    if (!staffName && foundDates.length === 0) continue

    const matched = staffName ? matchStaff(staffName, staffList) : null

    // Parse dates
    let from = "", to = ""
    if (foundDates.length >= 2) {
      from = parseDate(foundDates[0])
      to = parseDate(foundDates[1])
    } else if (foundDates.length === 1) {
      const range = parseDateRange(foundDates[0])
      from = range.from
      to = range.to
    }

    // Detect leave type
    const type = detectLeaveType(line)

    entries.push({
      id: `entry-${idCounter++}`,
      rawStaff: staffName || "?",
      matchedStaffId: matched?.id ?? null,
      matchedStaffName: matched ? `${matched.first_name} ${matched.last_name}` : null,
      from,
      to,
      type,
      rawText: line,
    })
  }

  return { entries }
}
