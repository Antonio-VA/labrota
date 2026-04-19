import {
  ArrowLeftRight,
  BarChart3,
  Calendar,
  Cloud,
  GripVertical,
  Palmtree,
  ShieldCheck,
  Wand2,
} from "lucide-react"
import type { Content, Lang } from "./content"

const featureIcons = [Wand2, Calendar, ShieldCheck, Palmtree, BarChart3, GripVertical, ArrowLeftRight, Cloud]

const featureAccents = [
  { color: "#7c3aed", bg: "#f5f3ff" }, // AI Setup — purple
  { color: "#1b4f8a", bg: "#eff6ff" }, // AI Rotas — brand blue
  { color: "#059669", bg: "#ecfdf5" }, // Competency — emerald
  { color: "#d97706", bg: "#fffbeb" }, // Leave — amber
  { color: "#6d28d9", bg: "#f5f3ff" }, // Holiday Balance — violet
  { color: "#475569", bg: "#f1f5f9" }, // Drag & Drop — slate
  { color: "#0891b2", bg: "#ecfeff" }, // Shift Swap — cyan
  { color: "#0284c7", bg: "#e0f2fe" }, // Outlook — sky
]

export function Features({ t, lang }: { t: Content["features"]; lang: Lang }) {
  return (
    <section id="features" className="py-24 border-y border-[#eef2f7]" style={{ background: "linear-gradient(180deg, #eef4ff 0%, #f8fafc 50%, #f0f9ff 100%)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="inline-block text-[12px] font-semibold text-[#1b4f8a] bg-white border border-[#dbeafe] px-4 py-1.5 rounded-full mb-5 shadow-sm">
            {lang === "es" ? "Funciones" : "Features"}
          </span>
          <h2 className="text-[clamp(28px,3.5vw,42px)] font-extrabold tracking-tight text-[#0f172a] mb-4">{t.title}</h2>
          <p className="text-[17px] text-[#64748b] max-w-xl mx-auto leading-relaxed">{t.sub}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {t.items.map((f, i) => {
            const Icon = featureIcons[i]
            const accent = featureAccents[i]
            return (
              <div key={f.title} className="rounded-2xl bg-white overflow-hidden shadow-sm hover:shadow-xl hover:shadow-[#1b4f8a]/10 hover:-translate-y-1.5 transition-all duration-200 cursor-default border border-white" style={{ boxShadow: "0 1px 4px rgba(27,79,138,0.08), 0 0 0 1px rgba(27,79,138,0.06)" }}>
                {/* Colored top bar */}
                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${accent.color}, ${accent.color}cc)` }} />
                <div className="p-5 md:p-6">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: accent.bg, color: accent.color }}>
                    <Icon className="w-[18px] h-[18px]" />
                  </div>
                  <h3 className="text-[14px] md:text-[15px] font-bold mb-2 leading-snug">{f.title}</h3>
                  <p className="text-[12px] md:text-[13px] text-[#64748b] leading-relaxed">{f.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
