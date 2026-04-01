import { getRequestConfig } from "next-intl/server"
import { cookies, headers } from "next/headers"

const SUPPORTED_LOCALES = ["es", "en"] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

function detectLocaleFromAcceptLanguage(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null
  const segments = acceptLanguage.split(",")
  for (const segment of segments) {
    const lang = segment.split(";")[0].trim().toLowerCase()
    const primary = lang.split("-")[0]
    if (SUPPORTED_LOCALES.includes(primary as Locale)) return primary as Locale
  }
  return null
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get("locale")?.value

  let locale: Locale
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
    locale = cookieLocale as Locale
  } else {
    const headerStore = await headers()
    const detected = detectLocaleFromAcceptLanguage(headerStore.get("accept-language"))
    locale = detected ?? "es"
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
