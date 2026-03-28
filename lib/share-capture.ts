/**
 * Captures a DOM element as a PNG image and triggers native share or download.
 */
export async function shareCapture(element: HTMLElement, fileName: string) {
  try {
    const html2canvas = (await import("html2canvas")).default

    // Temporarily remove pb-32 padding if present (avoids large whitespace at bottom)
    const hadPb = element.classList.contains("pb-32")
    if (hadPb) element.classList.remove("pb-32")

    // Scroll to top to ensure full capture
    const prevScroll = element.scrollTop
    element.scrollTop = 0

    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      // Capture the full scrollable content
      height: element.scrollHeight,
      windowHeight: element.scrollHeight,
    })

    // Restore state
    element.scrollTop = prevScroll
    if (hadPb) element.classList.add("pb-32")

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    )

    if (!blob) {
      console.error("shareCapture: canvas.toBlob returned null")
      return
    }

    const file = new File([blob], fileName, { type: "image/png" })

    // Try native Web Share API (iOS/Android share sheet)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const canShare = navigator.canShare?.({ files: [file] })
        if (canShare) {
          await navigator.share({ files: [file] })
          return
        }
      } catch (e) {
        // User cancelled or share failed — fall through to download
        if ((e as Error).name !== "AbortError") {
          console.error("shareCapture: navigator.share failed", e)
        }
      }
    }

    // Fallback: download the image
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error("shareCapture error:", err)
    // Show a simple alert as last resort
    alert(err instanceof Error ? err.message : "Could not capture image")
  }
}
