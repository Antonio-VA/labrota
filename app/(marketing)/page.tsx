"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useLocale } from "next-intl"
import { setLocale } from "@/lib/locale-action"
import {
  Calendar,
  ShieldCheck,
  Eye,
  BarChart3,
  CalendarOff,
  Sparkles,
  AlertTriangle,
  Clock,
  UserX,
  Check,
  ArrowRight,
  Play,
  Globe,
  Menu,
  X,
  Wand2,
  GripVertical,
} from "lucide-react"

// ─── i18n content ────────────────────────────────────────────────────────────

const content = {
  en: {
    nav: {
      features: "Features",
      how: "How it works",
      pricing: "Pricing",
      login: "Log in",
      cta: "Request Demo",
    },
    hero: {
      eyebrow: "🧬 Built exclusively for IVF labs",
      headline: "Smart Scheduling\nfor IVF Laboratories",
      sub: "Create, manage and optimise your fertility lab rotas with the only tool designed specifically for embryologists, andrologists and IVF lab managers.",
      cta1: "Request a Demo",
      cta2: "See how it works",
      badge1: "Mobile-optimised for staff",
      badge2: "Desktop-optimised for managers",
      badge3: "No training required",
    },
    social: null,
    problem: {
      badge: "The Problem",
      title: "Spreadsheets weren't designed for IVF lab scheduling",
      sub: "Lab managers spend hours every week juggling availability, competencies and last-minute changes — with a constant risk of human error.",
      p1title: "Error-prone coverage",
      p1: "Manual rota creation leads to skill-gap failures that risk critical IVF procedures and patient outcomes.",
      p2title: "Hours wasted every week",
      p2: "Lab managers spend 3–5 hours per week building rotas — time that should go to science, not spreadsheets.",
      p3title: "Invisible competency gaps",
      p3: "Spreadsheets can't tell you whether the person you've scheduled is actually certified for that IVF procedure — a silent but direct risk to patients.",
    },
    solution: {
      badge: "The Solution",
      title: "LabRota automates the complexity away",
      sub: "Purpose-built for IVF laboratories — LabRota understands embryologist competencies, procedure coverage, and the critical nature of every single shift.",
    },
    features: {
      title: "Everything your IVF lab needs",
      sub: "Built from the ground up for fertility labs — not a generic scheduling tool with a healthcare skin.",
      items: [
        { title: "AI-Powered Setup", body: "Share your existing spreadsheets or rotas. Our AI reads them, extracts your staff, shifts and procedure assignments, and configures your lab automatically — go live in one session." },
        { title: "AI Smart Rotas", body: "One click and LabRota's AI organises your entire shift schedule — balancing workload, respecting approved leave, and ensuring every procedure has the right certified staff assigned." },
        { title: "Competency Enforcement", body: "LabRota knows which procedures each staff member is certified for and flags gaps in real time — no more guessing who can cover what." },
        { title: "Real-time Visibility", body: "A live dashboard for managers and instant notifications for staff — everyone sees the rota the moment it changes." },
        { title: "Leave Management", body: "Staff request time off in the app, managers approve with one click — leave balances update automatically." },
        { title: "Drag & Drop Editing", body: "Fine-tune any AI-generated rota with a simple drag and drop. Skill gap warnings and coverage alerts update live as you move shifts around." },
      ],
    },
    how: {
      badge: "How it works",
      title: "From setup to published rota in minutes",
      steps: [
        { title: "We import your existing rotas", body: "Send us your spreadsheets. Our AI extracts your staff, shift patterns and procedure certifications — your lab is pre-configured before your first login." },
        { title: "Generate with AI", body: "Hit Generate. LabRota's AI analyses staff availability, certified competencies and approved leave across your whole team and builds the optimal rota automatically — in under a minute." },
        { title: "Review & adjust", body: "Drag and drop to make tweaks. LabRota flags skill gaps and coverage shortfalls in real time as you edit." },
        { title: "Publish & notify", body: "Publish the rota with one click. Your team is instantly notified. Export to PDF for records." },
      ],
      stat1: { value: "70%", label: "less time building rotas", sub: "avg. vs. spreadsheet workflow" },
      stat2: { value: "< 1 min", label: "to generate a full rota", sub: "with AI — from blank to done" },
      stat3: { value: "0", label: "skill gaps missed", sub: "AI catches them all" },
    },
    pricing: {
      title: "Simple, transparent pricing",
      sub: "No per-employee fees. One flat price per laboratory.",
      monthly: "Monthly",
      annual: "Annual",
      save: "Save 23%",
      price: { monthly: "129", annual: "99", was: "149", unit: "/lab/month" },
      promo: "Launch offer",
      features: [
        "Unlimited staff",
        "AI-powered rota generation",
        "Competency enforcement & skill gap detection",
        "AI scheduling assistant",
        "Leave management",
        "Real-time visibility & notifications",
        "Advanced analytics & PDF export",
        "AI-assisted lab setup from your existing rotas",
        "Priority support",
      ],
      cta: "Request a Demo",
    },
    cta: {
      title: "Ready to simplify your lab scheduling?",
      sub: "Join IVF laboratories that have replaced spreadsheets with smart, AI-powered rotas. Book a 30-minute demo — no commitment required.",
      btn: "Request a Demo",
    },
    footer: {
      tagline: "Smart scheduling for IVF laboratories.",
      product: "Product",
      legal: "Legal",
      contact: "Contact",
      links: {
        features: "Features",
        pricing: "Pricing",
        login: "Log in",
        privacy: "Privacy Policy",
        terms: "Terms of Service",
        gdpr: "GDPR",
      },
      copy: "© 2026 LabRota. All rights reserved.",
    },
  },
  es: {
    nav: {
      features: "Funciones",
      how: "Cómo funciona",
      pricing: "Precios",
      login: "Iniciar sesión",
      cta: "Solicitar Demo",
    },
    hero: {
      eyebrow: "🧬 Diseñado exclusivamente para labs IVF",
      headline: "Turnos inteligentes\npara laboratorios IVF",
      sub: "Crea, gestiona y optimiza las rotas de tu laboratorio de fertilidad con la única herramienta diseñada específicamente para embriólogos, andrólogos y responsables de lab IVF.",
      cta1: "Solicitar una Demo",
      cta2: "Ver cómo funciona",
      badge1: "Web optimizada para móvil",
      badge2: "Optimizado en escritorio para managers",
      badge3: "Sin formación previa",
    },
    social: null,
    problem: {
      badge: "El Problema",
      title: "Las hojas de cálculo no fueron diseñadas para planificar laboratorios IVF",
      sub: "Los responsables de laboratorio dedican horas cada semana a cuadrar disponibilidad, competencias y normativa — con el riesgo permanente del error humano.",
      p1title: "Cobertura propensa a errores",
      p1: "La creación manual de rotas genera fallos de cobertura que ponen en riesgo procedimientos IVF críticos y los resultados de los pacientes.",
      p2title: "Horas perdidas cada semana",
      p2: "Los responsables de lab dedican 3-5 horas semanales construyendo rotas — tiempo que debería ir a la ciencia, no a las hojas de cálculo.",
      p3title: "Brechas de competencias invisibles",
      p3: "Las hojas de cálculo no pueden saber si la persona asignada está realmente certificada para esa técnica IVF — un riesgo silencioso pero directo para los pacientes.",
    },
    solution: {
      badge: "La Solución",
      title: "LabRota automatiza la complejidad",
      sub: "Diseñado exclusivamente para laboratorios IVF — LabRota entiende las competencias de embriólogos, la cobertura de procedimientos y la naturaleza crítica de cada turno.",
    },
    features: {
      title: "Todo lo que tu laboratorio IVF necesita",
      sub: "Construido desde cero para laboratorios de fertilidad — no es otra herramienta genérica de turnos con apariencia sanitaria.",
      items: [
        { title: "Configuración con IA", body: "Comparte tus hojas de cálculo o rotas actuales. Nuestra IA las lee, extrae tu equipo, turnos y asignaciones de procedimientos, y configura tu laboratorio automáticamente — en una sola sesión." },
        { title: "Rotas Inteligentes con IA", body: "Un clic y la IA de LabRota organiza todo el horario de turnos — equilibrando carga, respetando ausencias aprobadas y asegurando que cada procedimiento tiene asignado el personal certificado correcto." },
        { title: "Control de Competencias", body: "LabRota sabe qué procedimientos domina cada miembro del equipo y señala las brechas en tiempo real — sin adivinanzas sobre quién puede cubrir qué." },
        { title: "Visibilidad en Tiempo Real", body: "Dashboard en directo para managers y notificaciones instantáneas para el equipo — todos ven la rota en el momento en que cambia." },
        { title: "Gestión de Ausencias", body: "El equipo solicita ausencias en la app, los managers aprueban con un clic — los saldos se actualizan automáticamente en la rota." },
        { title: "Edición con Arrastrar y Soltar", body: "Ajusta cualquier rota generada por IA con un simple arrastrar y soltar. Las alertas de brechas y cobertura se actualizan en tiempo real mientras mueves los turnos." },
      ],
    },
    how: {
      badge: "Cómo funciona",
      title: "De la configuración a la rota publicada en minutos",
      steps: [
        { title: "Importamos tus rotas actuales", body: "Envíanos tus hojas de cálculo. Nuestra IA extrae tu equipo, patrones de turno y certificaciones de procedimientos — tu laboratorio queda preconfigurado antes de tu primer inicio de sesión." },
        { title: "Genera con IA", body: "Pulsa Generar. La IA de LabRota analiza disponibilidad, competencias certificadas y ausencias aprobadas de todo el equipo y construye la rota óptima automáticamente — en menos de un minuto." },
        { title: "Revisa y ajusta", body: "Arrastra y suelta para hacer ajustes. LabRota señala brechas de competencias y problemas de cobertura en tiempo real mientras editas." },
        { title: "Publica y notifica", body: "Publica la rota con un clic. Tu equipo recibe la notificación al instante. Exporta a PDF para registros." },
      ],
      stat1: { value: "70%", label: "menos tiempo construyendo rotas", sub: "prom. frente al flujo con hojas de cálculo" },
      stat2: { value: "< 1 min", label: "para generar una rota completa", sub: "con IA — de cero a publicada" },
      stat3: { value: "0", label: "skill gaps perdidos", sub: "la IA los detecta todos" },
    },
    pricing: {
      title: "Precios simples y transparentes",
      sub: "Sin coste por empleado. Un precio fijo por laboratorio.",
      monthly: "Mensual",
      annual: "Anual",
      save: "Ahorra 23%",
      price: { monthly: "129", annual: "99", was: "149", unit: "/lab/mes" },
      promo: "Oferta de lanzamiento",
      features: [
        "Empleados ilimitados",
        "Generación de rotas con IA",
        "Control de competencias y detección de brechas",
        "Asistente IA de horarios",
        "Gestión de ausencias",
        "Visibilidad en tiempo real y notificaciones",
        "Analytics avanzados y exportación PDF",
        "Configuración asistida por IA desde tus rotas actuales",
        "Soporte prioritario",
      ],
      cta: "Solicitar una Demo",
    },
    cta: {
      title: "¿Listo para simplificar la planificación de tu laboratorio?",
      sub: "Únete a los laboratorios IVF que han sustituido las hojas de cálculo por rotas inteligentes con IA. Reserva una demo de 30 minutos — sin compromiso.",
      btn: "Solicitar una Demo",
    },
    footer: {
      tagline: "Horarios inteligentes para laboratorios IVF.",
      product: "Producto",
      legal: "Legal",
      contact: "Contacto",
      links: {
        features: "Funciones",
        pricing: "Precios",
        login: "Iniciar sesión",
        privacy: "Política de Privacidad",
        terms: "Términos de Servicio",
        gdpr: "RGPD",
      },
      copy: "© 2026 LabRota. Todos los derechos reservados.",
    },
  },
} as const

type Lang = keyof typeof content

// ─── Feature icons ────────────────────────────────────────────────────────────

const featureIcons = [Wand2, Calendar, ShieldCheck, Eye, CalendarOff, GripVertical]


// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <span className="text-[22px] leading-none tracking-tight select-none" aria-label="LabRota">
      <span className="font-light text-[#1B4F8A]">lab</span><span className="font-semibold text-[#1B4F8A]">rota</span>
    </span>
  )
}

// ─── Product mockup ───────────────────────────────────────────────────────────

const MOCK_DAYS = [
  { abbr: "LUN", num: 13 },
  { abbr: "MAR", num: 14 },
  { abbr: "MIÉ", num: 15 },
  { abbr: "JUE", num: 16 },
]

// highlight = blue chip
const MOCK_SHIFTS: { label: string; time: string; cells: { name: string; hl?: boolean }[][] }[] = [
  {
    label: "T1", time: "7:30–15:30",
    cells: [
      [{ name: "Amira" }, { name: "Carla" }],
      [{ name: "Dina" }, { name: "Sara" }],
      [{ name: "Dina" }, { name: "Yuki", hl: true }],
      [{ name: "Amira" }, { name: "Mei" }],
    ],
  },
  {
    label: "T2", time: "8:00–16:00",
    cells: [
      [{ name: "Fatima" }, { name: "Priya" }],
      [{ name: "Amira" }, { name: "Fatima" }],
      [{ name: "Carla" }, { name: "Priya" }],
      [{ name: "Carla" }, { name: "Fatima" }],
    ],
  },
  {
    label: "T4", time: "9:00–17:00",
    cells: [
      [{ name: "Yuki", hl: true }, { name: "Noor" }],
      [{ name: "Noor" }],
      [{ name: "Leila" }, { name: "Noor" }],
      [{ name: "Sara" }, { name: "Noor" }],
    ],
  },
]

function Chip({ name, hl }: { name: string; hl?: boolean }) {
  return (
    <span className={`inline-block rounded-md px-2 py-[3px] text-[11px] font-medium leading-tight whitespace-nowrap ${
      hl ? "bg-[#2563eb] text-white" : "bg-white border border-[#ccddee] text-[#334155]"
    }`}>{name}</span>
  )
}

function ProductMockup() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(27,79,138,0.18),0_4px_16px_rgba(27,79,138,0.1)] border border-[#e2e8f0] text-left select-none bg-white flex flex-col">

      {/* ── Browser chrome ── */}
      <div className="bg-[#f8fafc] border-b border-[#e2e8f0] h-9 flex items-center px-3 gap-2 flex-shrink-0">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#fca5a5]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#fcd34d]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#6ee7b7]" />
        </div>
        <div className="flex-1 mx-3 bg-white border border-[#e2e8f0] rounded-md h-5 flex items-center px-2">
          <span className="text-[9px] text-[#94a3b8]">app.labrota.app</span>
        </div>
      </div>

      {/* ── App shell ── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <div className="bg-[#0f172a] w-[56px] flex-shrink-0 flex flex-col items-center pt-3 pb-3 gap-0.5">
          {[
            { icon: "▦", label: "Horarios", active: true },
            { icon: "⚗", label: "Lab" },
            { icon: "👥", label: "Equipo" },
            { icon: "✈", label: "Ausencias" },
            { icon: "▤", label: "Informes" },
          ].map(item => (
            <div key={item.label} className={`w-full flex flex-col items-center py-2 gap-[3px] ${item.active ? "bg-[#1e3a5f]" : ""}`}>
              <span className={`text-[12px] leading-none ${item.active ? "text-[#60a5fa]" : "text-[#475569]"}`}>{item.icon}</span>
              <span className={`text-[7px] font-medium leading-none ${item.active ? "text-[#93c5fd]" : "text-[#475569]"}`}>{item.label}</span>
            </div>
          ))}
          <div className="flex-1" />
          <span className="text-[7px] text-[#334155] font-bold tracking-tight">lab<span className="text-[#3b82f6]">rota</span></span>
        </div>

        {/* Main */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Toolbar */}
          <div className="border-b border-[#e2e8f0] px-3 h-10 flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-[#0f172a]">IVF Clinic Abu Dhabi</span>
            <div className="flex-1" />
            <span className="text-[9px] text-[#64748b]">13–16 Abr</span>
            <span className="text-[9px] font-semibold text-white bg-[#1b4f8a] rounded px-2 py-0.5">Generar IA</span>
          </div>

          {/* Grid */}
          <div className="flex-1">

            {/* Day headers */}
            <div className="grid border-b border-[#e2e8f0] bg-[#f8fafc]" style={{ gridTemplateColumns: "60px repeat(4, 1fr)" }}>
              <div />
              {MOCK_DAYS.map(d => (
                <div key={d.num} className="text-center py-2 border-l border-[#e2e8f0]">
                  <div className="text-[8px] font-bold uppercase tracking-wide text-[#94a3b8]">{d.abbr}</div>
                  <div className="text-[15px] font-bold text-[#0f172a] leading-tight">{d.num}</div>
                </div>
              ))}
            </div>

            {/* Shift rows */}
            {MOCK_SHIFTS.map(shift => (
              <div key={shift.label} className="grid border-b border-[#e2e8f0]" style={{ gridTemplateColumns: "60px repeat(4, 1fr)" }}>
                <div className="flex flex-col justify-center px-2 py-2 border-r border-[#e2e8f0] bg-[#f8fafc]">
                  <span className="text-[11px] font-bold text-[#1b4f8a]">{shift.label}</span>
                  <span className="text-[8px] text-[#94a3b8] leading-tight">{shift.time}</span>
                </div>
                {shift.cells.map((staff, di) => (
                  <div key={di} className="p-2 border-l border-[#e2e8f0] flex flex-col gap-1">
                    {staff.map(s => <Chip key={s.name} name={s.name} hl={s.hl} />)}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* AI footer */}
          <div className="border-t border-[#e2e8f0] px-3 h-8 flex items-center gap-2 bg-[#eff6ff]">
            <span className="text-[10px]">✨</span>
            <span className="text-[9px] font-semibold text-[#1b4f8a]">Rota generated by AI</span>
            <span className="text-[9px] text-[#94a3b8]">·</span>
            <span className="text-[9px] text-[#16a34a] font-semibold">0 skill gaps</span>
            <div className="flex-1" />
            <span className="text-[9px] text-[#94a3b8]">in 4s</span>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const locale = useLocale()
  const [lang, setLang] = useState<Lang>(locale === "es" ? "es" : "en")
  const [annual, setAnnual] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  const t = content[lang]

  async function switchLang() {
    const next: Lang = lang === "en" ? "es" : "en"
    setLang(next)
    await setLocale(next)
  }

  return (
    <div className="min-h-screen bg-white text-[#0f172a] antialiased">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#ccddee]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex-shrink-0"><Logo /></Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {(["features", "how", "pricing"] as const).map(key => (
              <a key={key} href={`#${key}`} className="text-[14px] font-medium text-[#64748b] hover:text-[#1b4f8a] hover:bg-[#eff6ff] px-3 py-1.5 rounded-lg transition-colors">
                {t.nav[key]}
              </a>
            ))}
            <Link href="/login" className="text-[14px] font-medium text-[#1b4f8a] px-3 py-1.5 rounded-lg hover:bg-[#eff6ff] transition-colors">
              {t.nav.login}
            </Link>
            <Link href="#contact" className="text-[14px] font-semibold text-white bg-[#1b4f8a] px-4 py-2 rounded-lg hover:bg-[#164070] transition-colors">
              {t.nav.cta}
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
                {t.nav[key]}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <Link href="#contact" onClick={() => setMenuOpen(false)} className="flex-1 text-center text-[14px] font-semibold text-white bg-[#1b4f8a] py-2.5 rounded-lg">
                {t.nav.cta}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#1b4f8a] bg-[#eff6ff] border border-[#dbeafe] px-4 py-1.5 rounded-full mb-6">
            {t.hero.eyebrow}
          </span>
          <h1 className="text-[clamp(36px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight text-[#0f172a] mb-5 whitespace-pre-line">
            {t.hero.headline}
          </h1>
          <p className="text-[18px] text-[#64748b] leading-relaxed mb-9 max-w-lg">
            {t.hero.sub}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="#contact" className="inline-flex items-center gap-2 text-[15px] font-semibold text-white bg-[#1b4f8a] px-7 py-3.5 rounded-xl hover:bg-[#164070] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1b4f8a]/20 transition-all">
              {t.hero.cta1} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="#how" className="inline-flex items-center gap-2 text-[15px] font-semibold text-[#1b4f8a] bg-[#eff6ff] border border-[#dbeafe] px-7 py-3.5 rounded-xl hover:bg-[#dbeafe] hover:-translate-y-0.5 transition-all">
              <Play className="w-4 h-4" /> {t.hero.cta2}
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-5">
            {[t.hero.badge1, t.hero.badge2, t.hero.badge3].map(b => (
              <span key={b} className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
                <Check className="w-3.5 h-3.5 text-[#16a34a] flex-shrink-0" />{b}
              </span>
            ))}
          </div>
        </div>
        <div className="order-first md:order-last">
          <ProductMockup />
        </div>
      </section>


      {/* ── PROBLEM ── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <span className="inline-block text-[12px] font-semibold text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] px-4 py-1.5 rounded-full mb-4">{t.problem.badge}</span>
          <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-[#0f172a] mb-3">{t.problem.title}</h2>
          <p className="text-[17px] text-[#64748b] max-w-xl mx-auto leading-relaxed">{t.problem.sub}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {([
            { Icon: AlertTriangle, title: t.problem.p1title, body: t.problem.p1, iconBg: "bg-[#fef2f2]", iconColor: "text-[#ef4444]" },
            { Icon: Clock,         title: t.problem.p2title, body: t.problem.p2, iconBg: "bg-[#fffbeb]", iconColor: "text-[#d97706]" },
            { Icon: UserX,         title: t.problem.p3title, body: t.problem.p3, iconBg: "bg-[#fef2f2]", iconColor: "text-[#ef4444]" },
          ]).map(({ Icon, title, body, iconBg, iconColor }) => (
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

      {/* ── SOLUTION BANNER ── */}
      <div className="bg-[#1b4f8a] py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="inline-block text-[12px] font-semibold text-white bg-white/15 border border-white/25 px-4 py-1.5 rounded-full mb-5">{t.solution.badge}</span>
          <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold text-white tracking-tight mb-4">{t.solution.title}</h2>
          <p className="text-[18px] text-white/75 leading-relaxed">{t.solution.sub}</p>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="bg-[#f8fafc] border-y border-[#eef2f7] py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-[#0f172a] mb-3">{t.features.title}</h2>
            <p className="text-[17px] text-[#64748b] max-w-xl mx-auto">{t.features.sub}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {t.features.items.map((f, i) => {
              const Icon = featureIcons[i]
              return (
                <div key={f.title} className="rounded-xl border border-[#ccddee] bg-white p-7 hover:shadow-lg hover:shadow-[#1b4f8a]/08 hover:-translate-y-0.5 transition-all cursor-default">
                  <div className="w-12 h-12 rounded-xl bg-[#eff6ff] text-[#1b4f8a] flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-[16px] font-bold mb-2">{f.title}</h3>
                  <p className="text-[14px] text-[#64748b] leading-relaxed">{f.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 gap-20 items-center">
          {/* Steps */}
          <div>
            <span className="inline-flex items-center text-[12px] font-semibold text-[#1b4f8a] bg-[#eff6ff] border border-[#dbeafe] px-4 py-1.5 rounded-full mb-6">{t.how.badge}</span>
            <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-[#0f172a] mb-10">{t.how.title}</h2>
            <div className="flex flex-col gap-0">
              {t.how.steps.map((step, i) => (
                <div key={step.title} className="grid grid-cols-[52px_1fr] gap-5 pb-10 last:pb-0 relative">
                  <div className="w-[52px] h-[52px] rounded-full bg-[#1b4f8a] text-white flex items-center justify-center text-[20px] font-extrabold flex-shrink-0 z-10 relative">
                    {i + 1}
                  </div>
                  {i < t.how.steps.length - 1 && (
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
              <div className="text-[52px] font-extrabold text-[#1b4f8a] tracking-tight">{t.how.stat1.value}</div>
              <div className="text-[16px] font-semibold mt-1">{t.how.stat1.label}</div>
              <div className="text-[13px] text-[#94a3b8] mt-1">{t.how.stat1.sub}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[t.how.stat2, t.how.stat3].map(stat => (
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

      {/* ── PRICING ── */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-[#0f172a] mb-3">{t.pricing.title}</h2>
          <p className="text-[17px] text-[#64748b] mb-7">{t.pricing.sub}</p>
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
                {t.pricing[mode]}
                {mode === "annual" && (
                  <span className="text-[10px] font-bold bg-[#dcfce7] text-[#16a34a] px-2 py-0.5 rounded-full">
                    {t.pricing.save}
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
              {t.pricing.promo}
            </div>
            {/* Price */}
            <div className="text-center mb-8 pt-2">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-[18px] text-[#94a3b8] line-through">€{t.pricing.price.was}</span>
              </div>
              <div className="flex items-end justify-center gap-1">
                <span className="text-[24px] font-bold text-[#64748b] leading-[2]">€</span>
                <span className="text-[64px] font-extrabold tracking-tight text-[#0f172a] leading-none">
                  {annual ? t.pricing.price.annual : t.pricing.price.monthly}
                </span>
                <span className="text-[14px] text-[#94a3b8] mb-3">{t.pricing.price.unit}</span>
              </div>
              <p className="text-[13px] text-[#94a3b8] mt-1">{t.pricing.sub}</p>
            </div>
            {/* Features */}
            <ul className="flex flex-col gap-3 mb-8">
              {t.pricing.features.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-[#374151] leading-snug">
                  <Check className="w-4 h-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="#contact"
              className="block text-center py-3.5 rounded-xl text-[15px] font-semibold bg-[#1b4f8a] text-white hover:bg-[#164070] hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              {t.pricing.cta}
            </Link>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="contact" className="bg-[#0c1a2e] py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold text-white tracking-tight mb-4">{t.cta.title}</h2>
          <p className="text-[18px] text-white/65 leading-relaxed mb-10">{t.cta.sub}</p>
          <a
            href="mailto:info@labrota.app"
            className="inline-flex items-center gap-2 text-[16px] font-bold text-[#0f172a] bg-white px-9 py-4 rounded-xl hover:bg-[#f1f5f9] hover:-translate-y-0.5 hover:shadow-lg transition-all"
          >
            {t.cta.btn} <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[#eef2f7] py-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <Logo />
              <p className="text-[13px] text-[#94a3b8] mt-2">{t.footer.tagline}</p>
              <a href="mailto:info@labrota.app" className="text-[13px] text-[#64748b] hover:text-[#1b4f8a] transition-colors mt-1 inline-block">info@labrota.app</a>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/privacy" className="text-[13px] text-[#94a3b8] hover:text-[#1b4f8a] transition-colors">{t.footer.links.privacy}</Link>
              <Link href="/terms" className="text-[13px] text-[#94a3b8] hover:text-[#1b4f8a] transition-colors">{t.footer.links.terms}</Link>
              <Link href="/gdpr" className="text-[13px] text-[#94a3b8] hover:text-[#1b4f8a] transition-colors">{t.footer.links.gdpr}</Link>
              <button onClick={switchLang} className="flex items-center gap-1.5 text-[12px] text-[#94a3b8] border border-[#e2e8f0] rounded-md px-3 py-1.5 hover:text-[#1b4f8a] hover:border-[#dbeafe] transition-colors">
                <Globe className="w-3.5 h-3.5" /> {lang === "en" ? "Español" : "English"}
              </button>
            </div>
          </div>
          <p className="text-[12px] text-[#94a3b8] mt-8">{t.footer.copy}</p>
        </div>
      </footer>
    </div>
  )
}
