import Link from "next/link"
import { Globe } from "lucide-react"
import { Logo } from "./logo"
import type { Content, Lang } from "./content"

export function Footer({ t, lang, onSwitchLang }: {
  t: Content["footer"]
  lang: Lang
  onSwitchLang: () => void
}) {
  return (
    <footer className="border-t border-[#eef2f7] py-10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <Logo />
            <p className="text-[13px] text-[#94a3b8] mt-2">{t.tagline}</p>
            <a href="mailto:info@labrota.app" className="text-[13px] text-[#64748b] hover:text-[#1b4f8a] transition-colors mt-1 inline-block">info@labrota.app</a>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/privacy" className="text-[13px] text-[#94a3b8] hover:text-[#1b4f8a] transition-colors">{t.links.privacy}</Link>
            <Link href="/terms" className="text-[13px] text-[#94a3b8] hover:text-[#1b4f8a] transition-colors">{t.links.terms}</Link>
            <Link href="/gdpr" className="text-[13px] text-[#94a3b8] hover:text-[#1b4f8a] transition-colors">{t.links.gdpr}</Link>
            <button onClick={onSwitchLang} className="flex items-center gap-1.5 text-[12px] text-[#94a3b8] border border-[#e2e8f0] rounded-md px-3 py-1.5 hover:text-[#1b4f8a] hover:border-[#dbeafe] transition-colors">
              <Globe className="w-3.5 h-3.5" /> {lang === "en" ? "Español" : "English"}
            </button>
          </div>
        </div>
        <p className="text-[12px] text-[#94a3b8] mt-8">{t.copy}</p>
      </div>
    </footer>
  )
}
