import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "LabRota — Smart Scheduling for IVF Laboratories",
  description:
    "The only scheduling software designed specifically for IVF laboratories. HFEA-compliant rotas in minutes, not hours.",
  openGraph: {
    title: "LabRota — Smart Scheduling for IVF Laboratories",
    description:
      "Create, manage and optimise your fertility lab rotas with AI. Purpose-built for embryologists, andrologists and IVF lab managers.",
    type: "website",
    url: "https://labrota.app",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LabRota — Smart Scheduling for IVF Labs",
    description: "HFEA-compliant rotas in minutes, not hours.",
  },
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No sidebar, no auth — plain wrapper so the root layout still applies
  // (fonts, i18n provider, TooltipProvider, Toaster all come from app/layout.tsx)
  // globals.css sets `html, body { overflow: hidden; height: 100dvh }` for the
  // app shell. Marketing pages need to scroll, so we create our own scroll root.
  return (
    <div style={{ height: "100dvh", overflowY: "auto" }}>
      {children}
    </div>
  )
}
