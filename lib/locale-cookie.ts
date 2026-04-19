export type LocalePref = "es" | "en" | "browser"

export function readLocaleCookie(): LocalePref {
  if (typeof document === "undefined") return "browser"
  const match = document.cookie.match(/(?:^|; )locale=([^;]*)/)
  if (!match) return "browser"
  const val = decodeURIComponent(match[1])
  return val === "es" || val === "en" ? val : "browser"
}

export function writeLocaleCookie(locale: LocalePref): void {
  if (typeof document === "undefined") return
  if (locale === "browser") {
    document.cookie = "locale=;path=/;max-age=0"
  } else {
    document.cookie = `locale=${locale};path=/;max-age=${365 * 86400}`
  }
}

export function resolveLocale(): "es" | "en" {
  const pref = readLocaleCookie()
  return pref === "en" ? "en" : "es"
}
