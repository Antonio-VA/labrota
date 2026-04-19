import { ArrowRight } from "lucide-react"
import type { Content } from "./content"

export function FinalCta({ t }: { t: Content["cta"] }) {
  return (
    <section id="contact" className="bg-[#0c1a2e] py-20">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold text-white tracking-tight mb-4">{t.title}</h2>
        <p className="text-[18px] text-white/65 leading-relaxed mb-10">{t.sub}</p>
        <a
          href="mailto:info@labrota.app"
          className="inline-flex items-center gap-2 text-[16px] font-bold text-[#0f172a] bg-white px-9 py-4 rounded-xl hover:bg-[#f1f5f9] hover:-translate-y-0.5 hover:shadow-lg transition-all"
        >
          {t.btn} <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </section>
  )
}
