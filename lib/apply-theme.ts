export type ThemePrefs = {
  theme?: "light" | "dark" | "auto"
  accentColor?: string
  fontScale?: "s" | "m" | "l"
}

/** Apply theme preferences to the document. Pure with respect to its argument;
 *  reads/writes `document`, `localStorage`, and `window.matchMedia`. */
export function applyTheme(prefs: ThemePrefs) {
  const root = document.documentElement

  // Persist to localStorage + cookie (cookie is read server-side in layout.tsx)
  const themeData = JSON.stringify({ theme: prefs.theme, accentColor: prefs.accentColor, fontScale: prefs.fontScale })
  try {
    localStorage.setItem("labrota_theme", themeData)
    document.cookie = `labrota_theme=${encodeURIComponent(themeData)};path=/;max-age=${365 * 86400};SameSite=Lax`
  } catch {}

  if (prefs.accentColor) {
    root.style.setProperty("--primary", prefs.accentColor)
    root.style.setProperty("--ring", prefs.accentColor)
    root.style.setProperty("--sidebar-primary", prefs.accentColor)
    root.style.setProperty("--sidebar-ring", prefs.accentColor)
    root.style.setProperty("--header-bg", prefs.accentColor)
  }

  if (prefs.fontScale && prefs.fontScale !== "m") {
    const scale = prefs.fontScale === "s" ? "0.9" : "1.1"
    root.style.setProperty("--font-scale", scale)
    root.style.fontSize = `calc(14px * ${scale})`
    root.style.zoom = ""
  } else {
    root.style.removeProperty("--font-scale")
    root.style.fontSize = ""
    root.style.zoom = ""
  }

  if (prefs.theme === "dark") {
    root.setAttribute("data-theme", "dark")
    root.style.colorScheme = "dark"
  } else if (prefs.theme === "light") {
    root.removeAttribute("data-theme")
    root.style.colorScheme = "light"
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    if (prefersDark) { root.setAttribute("data-theme", "dark"); root.style.colorScheme = "dark" }
    else { root.removeAttribute("data-theme"); root.style.colorScheme = "light" }
  }
}
