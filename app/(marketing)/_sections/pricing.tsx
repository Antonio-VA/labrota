"use client"

import { useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import type { Content, Lang } from "./content"

export function Pricing({ t, lang }: { t: Content["pricing"]; lang: Lang }) {
  const [annual, setAnnual] = useState(true)
  const [staffCount, setStaffCount] = useState(12)

  return (
    <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-[#0f172a] mb-3">{t.title}</h2>
        <p className="text-[17px] text-[#64748b] mb-7">{t.sub}</p>
        {/* Toggle */}
        <div className="inline-flex bg-[#f1f5f9] rounded-lg p-1 gap-0.5">
          {(["monthly", "annual"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setAnnual(mode === "annual")}
              className={`px-4 py-2 rounded-md text-[13px] font-semibold transition-all flex items-center gap-2 ${
                annual === (mode === "annual") ? "bg-white text-[#0f172a] shadow-sm" : "text-[#64748b]"
              }`}
            >
              {t[mode]}
              {mode === "annual" && (
                <span className="text-[10px] font-bold bg-[#dcfce7] text-[#16a34a] px-2 py-0.5 rounded-full">
                  {t.save}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-lg rounded-2xl bg-white border-2 border-[#1b4f8a] p-10 shadow-[0_8px_40px_rgba(27,79,138,0.12)] relative">
          {/* Promo badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#f59e0b] text-white text-[11px] font-bold px-4 py-1 rounded-full whitespace-nowrap tracking-wide uppercase">
            {t.promo}
          </div>

          {/* Slider */}
          <div className="mb-8 pt-2">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] font-medium text-[#64748b]">{t.staffLabel}</span>
              <span className="inline-flex items-center justify-center min-w-[44px] h-9 px-3 rounded-lg bg-[#1b4f8a] text-white text-[20px] font-extrabold tabular-nums">{staffCount}</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={staffCount}
              onChange={e => setStaffCount(Number(e.target.value))}
              className="w-full cursor-pointer appearance-none h-[6px] rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#1b4f8a] [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(27,79,138,0.2)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#1b4f8a] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, #1b4f8a ${((staffCount - 5) / 25) * 100}%, #dbeafe ${((staffCount - 5) / 25) * 100}%)`,
              }}
            />
            <div className="flex justify-between mt-2">
              <span className="text-[11px] text-[#94a3b8]">5</span>
              <span className="text-[11px] text-[#94a3b8]">30</span>
            </div>
          </div>

          {/* Price */}
          <div className="text-center mb-8 bg-[#f8fafc] rounded-xl py-6 px-4">
            <p className="text-[12px] font-semibold text-[#1b4f8a] uppercase tracking-wide mb-2">{t.perPersonRate}</p>
            <div className="flex items-end justify-center gap-1 mb-1">
              <span className="text-[22px] font-bold text-[#64748b] leading-[1.8]">€</span>
              <span className="text-[60px] font-extrabold tracking-tight text-[#0f172a] leading-none">
                {annual ? Math.round(staffCount * 50 / 12) : staffCount * 5}
              </span>
              <span className="text-[13px] text-[#94a3b8] mb-3 leading-[1.3]">
                {annual ? t.perAnnualUnit : t.perMonthUnit}
              </span>
            </div>
            <p className="text-[13px] text-[#94a3b8] mt-2">
              {annual
                ? (lang === "es" ? `€${staffCount * 50}/año — 2 meses gratis` : `€${staffCount * 50}/year — 2 months free`)
                : (lang === "es" ? `Total ${staffCount} × €5` : `Total ${staffCount} × €5`)}
            </p>
          </div>

          {/* Features */}
          <ul className="flex flex-col gap-3 mb-8">
            {t.features.map(f => (
              <li key={f} className="flex items-start gap-2.5 text-[14px] text-[#374151] leading-snug">
                <Check className="w-4 h-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          <Link
            href="#contact"
            className="block text-center py-3.5 rounded-xl text-[15px] font-semibold bg-[#1b4f8a] text-white hover:-translate-y-0.5 hover:bg-[#164070] hover:shadow-md transition-all"
          >
            {t.cta}
          </Link>
        </div>
      </div>
    </section>
  )
}
