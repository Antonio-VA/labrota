import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

import type { Viewport } from "next"

export const metadata: Metadata = {
  title: "LabRota",
  description: "Embryology lab shift scheduling and AI assistant",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LabRota",
  },
  icons: {
    icon: "/brand/favicon.svg",
    apple: "/brand/favicon.svg",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  // Read theme from cookie (set by client on save)
  const cookieStore = await cookies()
  const themeCookie = cookieStore.get("labrota_theme")?.value
  let dataTheme: string | undefined
  let accentColor: string | undefined
  let fontScale: string | undefined
  try {
    if (themeCookie) {
      const p = JSON.parse(themeCookie)
      if (p.theme === "dark") dataTheme = "dark"
      if (p.accentColor) accentColor = p.accentColor
      if (p.fontScale === "s") fontScale = "0.9"
      else if (p.fontScale === "l") fontScale = "1.1"
    }
  } catch {}

  const rootStyle: Record<string, string> = { "color-scheme": dataTheme === "dark" ? "dark" : "light" }
  if (accentColor) {
    rootStyle["--primary"] = accentColor
    rootStyle["--ring"] = accentColor
    rootStyle["--sidebar-primary"] = accentColor
    rootStyle["--sidebar-ring"] = accentColor
    rootStyle["--header-bg"] = accentColor
  }
  if (fontScale) {
    rootStyle["--font-scale"] = fontScale
    rootStyle["fontSize"] = `calc(14px * ${fontScale})`
  }

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      {...(dataTheme ? { "data-theme": dataTheme } : {})}
      {...(Object.keys(rootStyle).length > 0 ? { style: rootStyle as React.CSSProperties } : {})}
    >
      <head>
        {/* Fallback for auto mode — needs client JS to check prefers-color-scheme */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var c = document.cookie.match(/labrota_theme=([^;]+)/);
            if (c) {
              var p = JSON.parse(decodeURIComponent(c[1]));
              var dark = p.theme === 'dark' || (p.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              if (dark) { document.documentElement.setAttribute('data-theme', 'dark'); document.documentElement.style.colorScheme = 'dark'; }
              else { document.documentElement.removeAttribute('data-theme'); document.documentElement.style.colorScheme = 'light'; }
              if (p.accentColor) {
                var r = document.documentElement.style;
                r.setProperty('--primary', p.accentColor);
                r.setProperty('--ring', p.accentColor);
                r.setProperty('--header-bg', p.accentColor);
              }
            }
          } catch(e) {}
        `}} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TooltipProvider delay={600}>{children}</TooltipProvider>
          <Toaster position="top-right" richColors closeButton />
        </NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
