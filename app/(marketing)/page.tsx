"use client"

import { useState } from "react"
import { useLocale } from "next-intl"
import { setLocale } from "@/lib/locale-action"
import { content, type Lang } from "./_sections/content"
import { Nav } from "./_sections/nav"
import { Hero } from "./_sections/hero"
import { Problem } from "./_sections/problem"
import { Solution } from "./_sections/solution"
import { Features } from "./_sections/features"
import { HowItWorks } from "./_sections/how-it-works"
import { Pricing } from "./_sections/pricing"
import { FinalCta } from "./_sections/final-cta"
import { Footer } from "./_sections/footer"

export default function MarketingPage() {
  const locale = useLocale()
  const [lang, setLang] = useState<Lang>(locale === "es" ? "es" : "en")
  const t = content[lang]

  async function switchLang() {
    const next: Lang = lang === "en" ? "es" : "en"
    setLang(next)
    await setLocale(next)
  }

  return (
    <div className="min-h-screen bg-white text-[#0f172a] antialiased">
      <Nav t={t.nav} />
      <Hero t={t.hero} />
      <Problem t={t.problem} />
      <Solution t={t.solution} />
      <Features t={t.features} lang={lang} />
      <HowItWorks t={t.how} />
      <Pricing t={t.pricing} lang={lang} />
      <FinalCta t={t.cta} />
      <Footer t={t.footer} lang={lang} onSwitchLang={switchLang} />
    </div>
  )
}
