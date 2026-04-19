import { AlertTriangle, Clock, UserX } from "lucide-react"
import type { Content } from "./content"

export function Problem({ t }: { t: Content["problem"] }) {
  const cards = [
    { Icon: AlertTriangle, title: t.p1title, body: t.p1, iconBg: "bg-[#fef2f2]", iconColor: "text-[#ef4444]" },
    { Icon: Clock,         title: t.p2title, body: t.p2, iconBg: "bg-[#fffbeb]", iconColor: "text-[#d97706]" },
    { Icon: UserX,         title: t.p3title, body: t.p3, iconBg: "bg-[#fef2f2]", iconColor: "text-[#ef4444]" },
  ]

  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-14">
        <span className="inline-block text-[12px] font-semibold text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] px-4 py-1.5 rounded-full mb-4">{t.badge}</span>
        <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-[#0f172a] mb-3">{t.title}</h2>
        <p className="text-[17px] text-[#64748b] max-w-xl mx-auto leading-relaxed">{t.sub}</p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {cards.map(({ Icon, title, body, iconBg, iconColor }) => (
          <div key={title} className="rounded-xl border border-[#ccddee] bg-white p-7 hover:shadow-lg hover:shadow-[#1b4f8a]/08 hover:-translate-y-0.5 transition-all">
            <div className={`w-12 h-12 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center mb-5`}>
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="text-[17px] font-bold mb-2">{title}</h3>
            <p className="text-[14px] text-[#64748b] leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
