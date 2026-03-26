import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
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

  const rootStyle: Record<string, string> = {}
  if (accentColor) {
    rootStyle["--primary"] = accentColor
    rootStyle["--ring"] = accentColor
    rootStyle["--sidebar-primary"] = accentColor
    rootStyle["--sidebar-ring"] = accentColor
  }
  if (fontScale) {
    rootStyle["--font-scale"] = fontScale
    rootStyle["zoom"] = fontScale
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
            const c = document.cookie.match(/labrota_theme=([^;]+)/);
            if (c) {
              const p = JSON.parse(decodeURIComponent(c[1]));
              if (p.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
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
      </body>
    </html>
  )
}
