import type { Metadata } from "next"
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

export const metadata: Metadata = {
  title: "LabRota",
  description: "Embryology lab shift scheduling and AI assistant",
  icons: {
    icon: "/brand/favicon.svg",
    apple: "/brand/logo-icon.svg",
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const p = JSON.parse(localStorage.getItem('labrota_theme') || '{}');
            const theme = p.theme || 'light';
            if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.setAttribute('data-theme', 'dark');
            }
            if (p.accentColor) {
              document.documentElement.style.setProperty('--primary', p.accentColor);
              document.documentElement.style.setProperty('--ring', p.accentColor);
              document.documentElement.style.setProperty('--sidebar-primary', p.accentColor);
              document.documentElement.style.setProperty('--sidebar-ring', p.accentColor);
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
