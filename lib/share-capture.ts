/**
 * Captures a DOM element as a PNG image and triggers native share or download.
 */
export async function shareCapture(element: HTMLElement, fileName: string) {
  try {
    const html2canvas = (await import("html2canvas")).default

    // Temporarily remove pb-32 padding if present
    const hadPb = element.classList.contains("pb-32")
    if (hadPb) element.classList.remove("pb-32")

    const prevScroll = element.scrollTop
    element.scrollTop = 0

    // Temporarily expand overflow-hidden/auto containers so full content is captured
    const prevOverflow = element.style.overflow
    const prevHeight = element.style.height
    const prevMaxHeight = element.style.maxHeight
    element.style.overflow = "visible"
    element.style.height = "auto"
    element.style.maxHeight = "none"

    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      height: element.scrollHeight,
      width: element.scrollWidth,
      windowHeight: element.scrollHeight,
      windowWidth: element.scrollWidth,
      onclone: (_doc: Document, clonedEl: HTMLElement) => {
        // Ensure cloned element is also fully expanded
        clonedEl.style.overflow = "visible"
        clonedEl.style.height = "auto"
        clonedEl.style.maxHeight = "none"
        convertOklabColors(clonedEl)
      },
    })

    // Restore
    element.style.overflow = prevOverflow
    element.style.height = prevHeight
    element.style.maxHeight = prevMaxHeight
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

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const canShare = navigator.canShare?.({ files: [file] })
        if (canShare) {
          await navigator.share({ files: [file] })
          return
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("shareCapture: navigator.share failed", e)
        }
      }
    }

    // Fallback: download
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
    alert(err instanceof Error ? err.message : "Could not capture image")
  }
}

/**
 * Walk the cloned DOM and replace any oklab/oklch color values
 * with their computed rgb equivalents. html2canvas cannot parse
 * these modern color functions.
 */
function convertOklabColors(root: HTMLElement) {
  const oklabRe = /oklch?\([^)]+\)/gi

  function processElement(el: HTMLElement) {
    const style = el.style
    const computed = window.getComputedStyle(el)

    // Properties that commonly contain colors
    const colorProps = [
      "color", "backgroundColor", "borderColor",
      "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
      "outlineColor", "textDecorationColor", "boxShadow",
    ]

    for (const prop of colorProps) {
      const val = computed.getPropertyValue(prop.replace(/([A-Z])/g, "-$1").toLowerCase())
      if (val && oklabRe.test(val)) {
        // The computed style should already be resolved to rgb by the browser
        // But if it's still oklab, force it through a temp element
        const resolved = resolveColor(val)
        if (resolved) {
          style.setProperty(prop.replace(/([A-Z])/g, "-$1").toLowerCase(), resolved, "important")
        }
      }
    }

    // Also inline any CSS custom properties that resolve to oklab
    const inlineStyle = el.getAttribute("style") ?? ""
    if (oklabRe.test(inlineStyle)) {
      el.setAttribute("style", inlineStyle.replace(oklabRe, (match) => resolveColor(match) ?? match))
    }

    for (const child of el.children) {
      if (child instanceof HTMLElement) processElement(child)
    }
  }

  processElement(root)
}

/** Resolve a color string to rgb using a temporary element */
function resolveColor(color: string): string | null {
  try {
    const temp = document.createElement("div")
    temp.style.color = color
    document.body.appendChild(temp)
    const computed = window.getComputedStyle(temp).color
    document.body.removeChild(temp)
    return computed // browsers return rgb()/rgba()
  } catch {
    return null
  }
}
