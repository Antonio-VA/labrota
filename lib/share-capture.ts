/**
 * Captures a DOM element as a PNG image and triggers native share or download.
 */
export async function shareCapture(element: HTMLElement, fileName: string) {
  const html2canvas = (await import("html2canvas")).default

  // Temporarily remove pb-32 padding if present (avoids large whitespace at bottom)
  const hadPb = element.classList.contains("pb-32")
  if (hadPb) element.classList.remove("pb-32")

  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  })

  if (hadPb) element.classList.add("pb-32")

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png")
  )

  const file = new File([blob], fileName, { type: "image/png" })

  // Try native Web Share API (iOS/Android share sheet)
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch {
      // User cancelled or share failed — fall through to download
    }
  }

  // Fallback: download the image
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
