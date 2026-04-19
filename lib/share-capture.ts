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
        sanitizeModernColors(_doc, clonedEl)
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
 * Sanitize the cloned DOCUMENT so html2canvas never encounters modern CSS
 * color functions (lab, oklch, oklab, lch, color) it cannot parse.
 *
 * Two-pronged approach:
 * 1. Replace modern colors in ALL <style> tags across the entire document
 *    (including <head>), since html2canvas reads all stylesheets.
 * 2. Force-inline computed rgb colors on every element in the captured root
 *    so html2canvas uses inline styles rather than stylesheet lookups.
 */
function sanitizeModernColors(doc: Document, root: HTMLElement) {
  const modernColorRe = /(?:oklch?|oklab|lab|lch|color)\([^)]+\)/gi

  // 1. Replace modern colors in ALL <style> tags in the entire cloned document
  const styleEls = doc.querySelectorAll("style")
  for (const styleEl of styleEls) {
    const text = styleEl.textContent ?? ""
    if (modernColorRe.test(text)) {
      modernColorRe.lastIndex = 0
      styleEl.textContent = text.replace(modernColorRe, (match) => resolveColor(match) ?? "transparent")
    }
  }

  // 1b. Disable all external linked stylesheets — html2canvas re-fetches and parses
  //     these, and they may contain modern color functions we can't patch.
  for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    link.disabled = true
  }

  // 2. Also nuke any CSS custom properties in :root that contain modern colors
  //    by injecting an override stylesheet with resolved values
  const computedRoot = window.getComputedStyle(document.documentElement)
  const cssVarOverrides: string[] = []
  // Get all CSS custom properties from the original document
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSStyleRule && rule.selectorText === ":root") {
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i]
            if (prop.startsWith("--")) {
              const val = rule.style.getPropertyValue(prop)
              if (modernColorRe.test(val)) {
                modernColorRe.lastIndex = 0
                const resolved = computedRoot.getPropertyValue(prop).trim()
                if (resolved) cssVarOverrides.push(`${prop}: ${resolved};`)
              }
            }
          }
        }
      }
    } catch {
      // Cross-origin stylesheet — skip
    }
  }
  if (cssVarOverrides.length > 0) {
    const overrideStyle = doc.createElement("style")
    overrideStyle.textContent = `:root { ${cssVarOverrides.join(" ")} }`
    doc.head.appendChild(overrideStyle)
  }

  // 3. Force-inline computed colors on every element in the captured root
  const colorProps = [
    "color", "background-color", "border-color",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "outline-color", "text-decoration-color",
  ] as const

  function processElement(el: HTMLElement) {
    const computed = window.getComputedStyle(el)

    for (const prop of colorProps) {
      const val = computed.getPropertyValue(prop)
      if (val && val !== "transparent" && val !== "rgba(0, 0, 0, 0)") {
        // Safari/iOS may return computed values in lab()/oklch() — resolve to rgb()
        const safe = modernColorRe.test(val)
          ? (modernColorRe.lastIndex = 0, resolveColor(val) ?? val)
          : val
        modernColorRe.lastIndex = 0
        el.style.setProperty(prop, safe, "important")
      }
    }

    const shadow = computed.getPropertyValue("box-shadow")
    if (shadow && shadow !== "none" && modernColorRe.test(shadow)) {
      modernColorRe.lastIndex = 0
      el.style.setProperty("box-shadow", shadow.replace(modernColorRe, (m) => resolveColor(m) ?? "transparent"), "important")
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

/**
 * Build a temporary off-screen container that composes:
 * 1. A date header
 * 2. A clone of the grid element (fully expanded)
 * 3. A clone of the notes element (if any)
 *
 * Returns the container (already appended to body) and a cleanup function.
 */
function buildCaptureContainer(opts: {
  gridEl: HTMLElement
  dateLabel: string
  notesEl?: HTMLElement | null
}): { container: HTMLElement; cleanup: () => void } {
  const container = document.createElement("div")
  container.style.cssText = "position:fixed;left:-9999px;top:0;background:#fff;padding:24px;font-family:var(--font-geist-sans,ui-sans-serif,system-ui,sans-serif);"

  // Date header
  const header = document.createElement("div")
  header.style.cssText = "font-size:16px;font-weight:600;color:#1e293b;margin-bottom:12px;padding-left:4px;"
  header.textContent = opts.dateLabel
  container.appendChild(header)

  // Clone grid
  const gridClone = opts.gridEl.cloneNode(true) as HTMLElement
  gridClone.style.overflow = "visible"
  gridClone.style.height = "auto"
  gridClone.style.maxHeight = "none"
  gridClone.style.position = "static"
  container.appendChild(gridClone)

  // Clone notes
  if (opts.notesEl) {
    const notesClone = opts.notesEl.cloneNode(true) as HTMLElement
    notesClone.style.cssText = "margin-top:12px;"
    // Remove any hidden classes
    notesClone.classList.remove("hidden")
    container.appendChild(notesClone)
  }

  document.body.appendChild(container)

  return {
    container,
    cleanup: () => document.body.removeChild(container),
  }
}

/**
 * Captures the full rota (date header + grid + notes) as PNG and copies to clipboard.
 */
export async function copyRotaToClipboard(opts: {
  gridEl: HTMLElement
  dateLabel: string
  notesEl?: HTMLElement | null
}) {
  const { container, cleanup } = buildCaptureContainer(opts)

  const blobPromise = (async () => {
    const html2canvas = (await import("html2canvas")).default

    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      height: container.scrollHeight,
      width: container.scrollWidth,
      onclone: (_doc: Document, clonedEl: HTMLElement) => {
        sanitizeModernColors(_doc, clonedEl)
      },
    })

    cleanup()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    )

    if (!blob) throw new Error("Failed to create image")
    return blob
  })()

  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const item = new ClipboardItem({ "image/png": blobPromise })
      await navigator.clipboard.write([item])
      return
    }
  } catch {
    // Fall through to download fallback
  }

  const blob = await blobPromise
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "labrota-capture.png"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Captures the full rota (date header + grid + notes) as PNG and triggers share or download.
 */
export async function shareRotaCapture(opts: {
  gridEl: HTMLElement
  dateLabel: string
  notesEl?: HTMLElement | null
  fileName: string
}) {
  const { container, cleanup } = buildCaptureContainer(opts)

  try {
    const html2canvas = (await import("html2canvas")).default

    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      height: container.scrollHeight,
      width: container.scrollWidth,
      onclone: (_doc: Document, clonedEl: HTMLElement) => {
        sanitizeModernColors(_doc, clonedEl)
      },
    })

    cleanup()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    )

    if (!blob) {
      console.error("shareRotaCapture: canvas.toBlob returned null")
      return
    }

    const file = new File([blob], opts.fileName, { type: "image/png" })

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const canShare = navigator.canShare?.({ files: [file] })
        if (canShare) {
          await navigator.share({ files: [file] })
          return
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("shareRotaCapture: navigator.share failed", e)
        }
      }
    }

    // Fallback: download
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = opts.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    cleanup()
    console.error("shareRotaCapture error:", err)
    alert(err instanceof Error ? err.message : "Could not capture image")
  }
}

/**
 * Captures a DOM element as PNG and copies to clipboard.
 *
 * Key: we create the ClipboardItem synchronously within the user gesture,
 * passing a Promise<Blob> that resolves later after html2canvas finishes.
 * This preserves the user activation so the browser allows clipboard.write.
 */
export async function copyToClipboard(element: HTMLElement) {
  // Build the blob promise synchronously within the user gesture
  const blobPromise = (async () => {
    const html2canvas = (await import("html2canvas")).default

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
      onclone: (_doc: Document, clonedEl: HTMLElement) => {
        clonedEl.style.overflow = "visible"
        clonedEl.style.height = "auto"
        clonedEl.style.maxHeight = "none"
        sanitizeModernColors(_doc, clonedEl)
      },
    })

    element.style.overflow = prevOverflow
    element.style.height = prevHeight
    element.style.maxHeight = prevMaxHeight

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    )

    if (!blob) throw new Error("Failed to create image")
    return blob
  })()

  // Create ClipboardItem synchronously (within user gesture) with deferred blob
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        "image/png": blobPromise,
      })
      await navigator.clipboard.write([item])
      return
    }
  } catch {
    // Fall through to download fallback
  }

  // Fallback: download the image
  const blob = await blobPromise
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "labrota-capture.png"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
