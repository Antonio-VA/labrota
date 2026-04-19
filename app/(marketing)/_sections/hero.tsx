import Link from "next/link"
import { ArrowRight, Check, Play } from "lucide-react"
import { ProductMockup } from "./product-mockup"
import type { Content } from "./content"

export function Hero({ t }: { t: Content["hero"] }) {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-16 items-center">
      <div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#1b4f8a] bg-[#eff6ff] border border-[#dbeafe] px-4 py-1.5 rounded-full mb-6">
          {t.eyebrow}
        </span>
        <h1 className="text-[clamp(36px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight text-[#0f172a] mb-5 whitespace-pre-line">
          {t.headline}
        </h1>
        <p className="text-[18px] text-[#64748b] leading-relaxed mb-9 max-w-lg">
          {t.sub}
        </p>
        <div className="flex gap-2 sm:gap-3">
          <Link href="#contact" className="inline-flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[15px] font-semibold text-white bg-[#1b4f8a] px-4 sm:px-7 py-3 sm:py-3.5 rounded-xl hover:bg-[#164070] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1b4f8a]/20 transition-all">
            {t.cta1} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="#how" className="inline-flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[15px] font-semibold text-[#1b4f8a] bg-[#eff6ff] border border-[#dbeafe] px-4 sm:px-7 py-3 sm:py-3.5 rounded-xl hover:bg-[#dbeafe] hover:-translate-y-0.5 transition-all">
            <Play className="w-4 h-4 shrink-0" /> {t.cta2}
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-5">
          {[t.badge1, t.badge2, t.badge3, t.badge4].map(b => (
            <span key={b} className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
              <Check className="w-3.5 h-3.5 text-[#16a34a] flex-shrink-0" />{b}
            </span>
          ))}
        </div>
      </div>
      <div className="md:order-last flex justify-center">
        <ProductMockup />
      </div>
    </section>
  )
}
