import type { Content } from "./content"

export function Solution({ t }: { t: Content["solution"] }) {
  return (
    <div className="bg-[#1b4f8a] py-16">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <span className="inline-block text-[12px] font-semibold text-white bg-white/15 border border-white/25 px-4 py-1.5 rounded-full mb-5">{t.badge}</span>
        <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold text-white tracking-tight mb-4">{t.title}</h2>
        <p className="text-[18px] text-white/75 leading-relaxed">{t.sub}</p>
      </div>
    </div>
  )
}
