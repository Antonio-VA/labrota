"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { Logo } from "./logo"
import type { Content } from "./content"

export function Nav({ t }: { t: Content["nav"] }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#ccddee]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex-shrink-0"><Logo /></Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {(["features", "how", "pricing"] as const).map(key => (
            <a key={key} href={`#${key}`} className="text-[14px] font-medium text-[#64748b] hover:text-[#1b4f8a] hover:bg-[#eff6ff] px-3 py-1.5 rounded-lg transition-colors">
              {t[key]}
            </a>
          ))}
          <Link href="/login" className="text-[14px] font-medium text-[#1b4f8a] px-3 py-1.5 rounded-lg hover:bg-[#eff6ff] transition-colors">
            {t.login}
          </Link>
          <Link href="#contact" className="text-[14px] font-semibold text-white bg-[#1b4f8a] px-4 py-2 rounded-lg hover:bg-[#164070] transition-colors">
            {t.cta}
          </Link>
        </div>

        {/* Hamburger */}
        <button className="md:hidden text-[#1b4f8a]" onClick={() => setMenuOpen(o => !o)}>
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#ccddee] bg-white px-6 py-4 flex flex-col gap-3">
          {(["features", "how", "pricing"] as const).map(key => (
            <a key={key} href={`#${key}`} onClick={() => setMenuOpen(false)} className="text-[16px] font-medium text-[#0f172a] py-2 px-3 rounded-lg hover:bg-[#f8fafc]">
              {t[key]}
            </a>
          ))}
          <div className="flex gap-2 pt-2">
            <Link href="/login" onClick={() => setMenuOpen(false)} className="flex-1 text-center text-[14px] font-semibold text-[#1b4f8a] border border-[#1b4f8a] py-2.5 rounded-lg hover:bg-[#eff6ff] transition-colors">
              {t.login}
            </Link>
            <Link href="#contact" onClick={() => setMenuOpen(false)} className="flex-1 text-center text-[14px] font-semibold text-white bg-[#1b4f8a] py-2.5 rounded-lg">
              {t.cta}
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
