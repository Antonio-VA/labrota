import type { ProcessedFile } from "@/lib/types/import"

export async function processExcel(file: File): Promise<ProcessedFile> {
  const XLSX = await import("xlsx")
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: "array" })
  const texts: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" })
    texts.push(`Sheet: ${name}\n${csv}`)
  }
  return { type: "text", content: texts.join("\n\n"), fileName: file.name }
}

export async function processPdf(file: File): Promise<ProcessedFile> {
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
    pages.push(text)
  }
  return { type: "text", content: pages.join("\n\n"), fileName: file.name }
}

export async function processImage(file: File): Promise<ProcessedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(",")[1]
      resolve({ type: "image", base64, mediaType: file.type, fileName: file.name })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function processFile(file: File): Promise<ProcessedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (["xlsx", "xls", "csv"].includes(ext)) return processExcel(file)
  if (ext === "pdf") return processPdf(file)
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return processImage(file)
  const text = await file.text()
  return { type: "text", content: text, fileName: file.name }
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
