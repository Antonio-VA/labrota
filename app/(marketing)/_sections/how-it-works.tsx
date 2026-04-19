import type { Content } from "./content"

export function HowItWorks({ t }: { t: Content["how"] }) {
  return (
    <section id="how" className="max-w-6xl mx-auto px-6 py-20">
      <div className="grid md:grid-cols-2 gap-20 items-center">
        {/* Steps */}
        <div>
          <span className="inline-flex items-center text-[12px] font-semibold text-[#1b4f8a] bg-[#eff6ff] border border-[#dbeafe] px-4 py-1.5 rounded-full mb-6">{t.badge}</span>
          <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-[#0f172a] mb-10">{t.title}</h2>
          <div className="flex flex-col gap-0">
            {t.steps.map((step, i) => (
              <div key={step.title} className="grid grid-cols-[52px_1fr] gap-5 pb-10 last:pb-0 relative">
                <div className="w-[52px] h-[52px] rounded-full bg-[#1b4f8a] text-white flex items-center justify-center text-[20px] font-extrabold flex-shrink-0 z-10 relative">
                  {i + 1}
                </div>
                {i < t.steps.length - 1 && (
                  <div className="absolute left-[25px] top-[52px] bottom-0 w-0.5 bg-[#ccddee]" />
                )}
                <div className="pt-3">
                  <h3 className="text-[18px] font-bold mb-2">{step.title}</h3>
                  <p className="text-[15px] text-[#64748b] leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[#ccddee] bg-white p-9 text-center hover:shadow-md transition-shadow">
            <div className="text-[52px] font-extrabold text-[#1b4f8a] tracking-tight">{t.stat1.value}</div>
            <div className="text-[16px] font-semibold mt-1">{t.stat1.label}</div>
            <div className="text-[13px] text-[#94a3b8] mt-1">{t.stat1.sub}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[t.stat2, t.stat3].map(stat => (
              <div key={stat.value} className="rounded-xl border border-[#ccddee] bg-white p-6 text-center hover:shadow-md transition-shadow">
                <div className="text-[36px] font-extrabold text-[#1b4f8a] tracking-tight">{stat.value}</div>
                <div className="text-[13px] font-semibold mt-1">{stat.label}</div>
                <div className="text-[11px] text-[#94a3b8] mt-0.5">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
