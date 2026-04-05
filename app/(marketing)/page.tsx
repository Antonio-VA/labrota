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
        { title: "AI Smart Rotas", body: "Describe what you need in plain language and LabRota generates the optimal rota instantly — balancing workload, respecting leave, and avoiding skill gaps across every shift." },
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
        { title: "Generate with AI", body: "Ask LabRota in plain language to build the rota — it balances workload, respects leave, avoids skill gaps and adapts to your lab's specific procedures automatically." },
        { title: "Review & adjust", body: "Drag and drop to make tweaks. LabRota flags skill gaps and coverage shortfalls in real time as you edit." },
        { title: "Publish & notify", body: "Publish the rota with one click. Your team is instantly notified. Export to PDF for records." },
      ],
      stat1: { value: "70%", label: "less time building rotas", sub: "avg. vs. spreadsheet workflow" },
      stat2: { value: "< 5 min", label: "to generate a full rota", sub: "with AI — from blank to done" },
      stat3: { value: "0", label: "skill gaps missed", sub: "AI catches them all" },
    },
    testimonials: {
      title: "What lab professionals say",
      items: [
        { quote: "LabRota replaced our spreadsheets overnight. We now build rotas in minutes instead of spending hours every Monday morning.", name: "Dr. María López", role: "Lab Director — IVF Madrid" },
        { quote: "The AI assistant suggested a rota that covered all our skill gaps — something I'd have almost certainly missed managing it manually.", name: "Dr. Ana García", role: "Lab Manager — Barcelona IVF Centre" },
      ],
    },
    pricing: {
      title: "Simple, transparent pricing",
      sub: "No per-employee fees. One flat price per laboratory.",
      monthly: "Monthly",
      annual: "Annual",
      save: "Save 20%",
      price: { monthly: "199", annual: "159", unit: "/lab/month" },
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
        { title: "Rotas Inteligentes con IA", body: "Describe lo que necesitas en lenguaje natural y LabRota genera la rota óptima al instante — equilibrando carga, respetando ausencias y evitando brechas de competencias en cada turno." },
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
        { title: "Genera con IA", body: "Pide a LabRota en lenguaje natural que construya la rota — equilibra la carga, respeta las ausencias, evita los skill gaps y se adapta automáticamente a los procedimientos de tu laboratorio." },
        { title: "Revisa y ajusta", body: "Arrastra y suelta para hacer ajustes. LabRota señala brechas de competencias y problemas de cobertura en tiempo real mientras editas." },
        { title: "Publica y notifica", body: "Publica la rota con un clic. Tu equipo recibe la notificación al instante. Exporta a PDF para registros." },
      ],
      stat1: { value: "70%", label: "menos tiempo construyendo rotas", sub: "prom. frente al flujo con hojas de cálculo" },
      stat2: { value: "< 5 min", label: "para generar una rota completa", sub: "con IA — de cero a publicada" },
      stat3: { value: "0", label: "skill gaps perdidos", sub: "la IA los detecta todos" },
    },
    testimonials: {
      title: "Lo que dicen los profesionales",
      items: [
        { quote: "LabRota sustituyó nuestras hojas de cálculo de la noche a la mañana. Ahora creamos rotas en minutos en lugar de pasar horas cada lunes.", name: "Dra. María López", role: "Directora de Laboratorio — IVF Madrid" },
        { quote: "El asistente IA sugirió una rota que cubría todos nuestros skill gaps — algo que casi con seguridad habría pasado por alto gestionándolo manualmente.", name: "Dra. Ana García", role: "Lab Manager — Barcelona IVF Centre" },
      ],
    },
    pricing: {
      title: "Precios simples y transparentes",
      sub: "Sin coste por empleado. Un precio fijo por laboratorio.",
      monthly: "Mensual",
      annual: "Anual",
      save: "Ahorra 20%",
      price: { monthly: "199", annual: "159", unit: "/lab/mes" },
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
  { abbr: "VIE", num: 17 },
]

const MOCK_SHIFTS = [
  {
    label: "T1", time: "7:30 – 15:30",
    cells: [
      ["Amira H.", "Carla R."],
      ["Dina O.", "Sara P."],
      ["Dina O.", "Sara P.", "Yuki T."],
      ["Amira H.", "Mei C."],
      ["Amira H.", "Dina O."],
    ],
  },
  {
    label: "T2", time: "8:00 – 16:00",
    cells: [
      ["Fatima A.", "Priya S."],
      ["Amira H.", "Fatima A."],
      ["Carla R.", "Priya S."],
      ["Carla R.", "Fatima A."],
      ["Carla R.", "Priya S."],
    ],
  },
  {
    label: "T4", time: "9:00 – 17:00",
    cells: [
      ["Yuki T.", "Noor A."],
      ["Noor A."],
      ["Leila M.", "Noor A."],
      ["Sara P.", "Noor A."],
      ["Mei C.", "Noor A."],
    ],
  },
]

const MOCK_STAFF = [
  { k: "AH" }, { k: "CR" }, { k: "DO" }, { k: "FA" },
  { k: "LM" }, { k: "MC" }, { k: "NA" }, { k: "PS" },
  { k: "SP" }, { k: "YT", active: true },
]

function Chip({ name }: { name: string }) {
  const blue = name === "Yuki T."
  return (
    <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-medium leading-tight whitespace-nowrap ${
      blue ? "bg-[#2563eb] text-white" : "bg-white border border-[#ccddee] text-[#334155]"
    }`}>{name}</span>
  )
}

function ProductMockup() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(27,79,138,0.18),0_4px_16px_rgba(27,79,138,0.1)] border border-[#1e293b] flex text-left select-none bg-white">

      {/* ── Sidebar ── */}
      <div className="bg-[#0f172a] w-[64px] flex-shrink-0 flex flex-col items-center pt-4 pb-3 gap-0.5">
        {[
          { icon: "▦", label: "Horarios", active: true },
          { icon: "⚗", label: "Lab" },
          { icon: "👥", label: "Equipo" },
          { icon: "✈", label: "Ausencias" },
          { icon: "▤", label: "Informes" },
          { icon: "⚙", label: "Admin" },
        ].map(item => (
          <div key={item.label} className={`w-full flex flex-col items-center py-2 gap-1 ${item.active ? "bg-[#1e3a5f]" : ""}`}>
            <span className={`text-[13px] leading-none ${item.active ? "text-[#60a5fa]" : "text-[#475569]"}`}>{item.icon}</span>
            <span className={`text-[8px] font-medium leading-none ${item.active ? "text-[#93c5fd]" : "text-[#475569]"}`}>{item.label}</span>
          </div>
        ))}
        <div className="flex-1" />
        <span className="text-[9px] text-[#1e3a5f] font-semibold">labrota</span>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Toolbar */}
        <div className="border-b border-[#e2e8f0] px-3 h-10 flex items-center gap-2 shrink-0 bg-white">
          <span className="text-[10px] font-semibold text-[#0f172a]">IVF Clinic Abu Dhabi</span>
          <span className="text-[9px] text-[#94a3b8]">▼</span>
          <div className="w-px h-4 bg-[#e2e8f0] mx-1" />
          <span className="text-[9px] text-[#64748b]">◀ ▶</span>
          <span className="text-[10px] font-semibold text-[#0f172a]">13 – 19 Abr 2026</span>
          <div className="flex-1" />
          <span className="text-[9px] bg-[#eff6ff] text-[#1b4f8a] border border-[#dbeafe] rounded-md px-2 py-0.5 font-semibold">Semana</span>
          <span className="text-[9px] bg-[#fef9c3] text-[#92400e] border border-[#fde68a] rounded-md px-1.5 py-0.5 font-bold">⚠ 5</span>
          <span className="text-[9px] font-semibold text-white bg-[#1b4f8a] rounded-md px-2 py-1">Regenerar horario</span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-hidden">

          {/* Column headers */}
          <div className="grid border-b border-[#e2e8f0]" style={{ gridTemplateColumns: "72px repeat(5, 1fr)" }}>
            <div />
            {MOCK_DAYS.map(d => (
              <div key={d.num} className="text-center py-2 border-l border-[#e2e8f0]">
                <div className="text-[9px] font-bold uppercase tracking-wide text-[#64748b]">{d.abbr}</div>
                <div className="text-[16px] font-bold text-[#0f172a] leading-tight">{d.num}</div>
              </div>
            ))}
          </div>

          {/* Shift rows */}
          {MOCK_SHIFTS.map(shift => (
            <div key={shift.label} className="grid border-b border-[#e2e8f0]" style={{ gridTemplateColumns: "72px repeat(5, 1fr)" }}>
              <div className="flex flex-col justify-center px-2 py-2 border-r border-[#e2e8f0] bg-[#f8fafc]">
                <span className="text-[11px] font-bold text-[#1b4f8a]">{shift.label}</span>
                <span className="text-[9px] text-[#94a3b8] leading-tight">{shift.time}</span>
              </div>
              {shift.cells.map((names, di) => (
                <div key={di} className="p-1.5 border-l border-[#e2e8f0] flex flex-col gap-1">
                  {names.map(n => <Chip key={n} name={n} />)}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#e2e8f0] px-3 h-8 flex items-center gap-2 shrink-0 bg-[#f8fafc]">
          <span className="text-[9px] text-[#94a3b8] font-medium">Turnos</span>
          <div className="flex gap-1.5 flex-wrap">
            {MOCK_STAFF.map(s => (
              <span key={s.k} className={`text-[9px] font-semibold rounded px-1.5 py-0.5 ${
                s.active ? "bg-[#2563eb] text-white" : "text-[#64748b]"
              }`}>{s.k} 6/6</span>
            ))}
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

      {/* ── TESTIMONIALS ── */}
      <section className="bg-[#f8fafc] border-y border-[#eef2f7] py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-center text-[#0f172a] mb-12">{t.testimonials.title}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {t.testimonials.items.map(item => (
              <div key={item.name} className="rounded-xl border border-[#ccddee] bg-white p-7 relative hover:shadow-md transition-shadow">
                <div className="absolute top-5 right-5 text-[72px] leading-none text-[#1b4f8a] opacity-[0.06] font-serif select-none">"</div>
                <p className="text-[14px] text-[#374151] leading-[1.75] italic mb-5">"{item.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#eff6ff] text-[#1b4f8a] flex items-center justify-center text-[16px] font-bold flex-shrink-0">
                    {item.name[0]}
                  </div>
                  <div>
                    <div className="text-[14px] font-bold">{item.name}</div>
                    <div className="text-[12px] text-[#94a3b8]">{item.role}</div>
                  </div>
                </div>
              </div>
            ))}
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
          <div className="w-full max-w-lg rounded-2xl bg-white border-2 border-[#1b4f8a] p-10 shadow-[0_8px_40px_rgba(27,79,138,0.12)]">
            {/* Price */}
            <div className="text-center mb-8">
              <div className="flex items-end justify-center gap-1 mb-1">
                <span className="text-[24px] font-bold text-[#64748b] leading-[2]">€</span>
                <span className="text-[64px] font-extrabold tracking-tight text-[#0f172a] leading-none">
                  {annual ? t.pricing.price.annual : t.pricing.price.monthly}
                </span>
                <span className="text-[14px] text-[#94a3b8] mb-3">{t.pricing.price.unit}</span>
              </div>
              <p className="text-[13px] text-[#94a3b8]">{t.pricing.sub}</p>
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
      <footer className="border-t border-[#eef2f7] py-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Logo />
              <p className="text-[13px] text-[#94a3b8] mt-3 leading-relaxed max-w-[220px]">{t.footer.tagline}</p>
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#0f172a] mb-2">{t.footer.contact}</p>
                <a href="mailto:info@labrota.app" className="text-[13px] text-[#64748b] hover:text-[#1b4f8a] transition-colors">info@labrota.app</a>
              </div>
            </div>
            {([
              { heading: t.footer.product, links: [{ label: t.footer.links.features, href: "#features" }, { label: t.footer.links.pricing, href: "#pricing" }, { label: t.footer.links.login, href: "/login" }] },
              { heading: t.footer.legal,   links: [{ label: t.footer.links.privacy, href: "/privacy" }, { label: t.footer.links.terms, href: "/terms" }, { label: t.footer.links.gdpr, href: "/gdpr" }] },
            ]).map(col => (
              <div key={col.heading}>
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-[#0f172a] mb-4">{col.heading}</h4>
                <div className="flex flex-col gap-2.5">
                  {col.links.map(l => (
                    <Link key={l.label} href={l.href} className="text-[13px] text-[#64748b] hover:text-[#1b4f8a] transition-colors">{l.label}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#eef2f7] pt-7 flex flex-wrap justify-between items-center gap-3">
            <p className="text-[12px] text-[#94a3b8]">{t.footer.copy}</p>
            <button onClick={switchLang} className="flex items-center gap-1.5 text-[12px] text-[#94a3b8] border border-[#e2e8f0] rounded-md px-3 py-1.5 hover:text-[#1b4f8a] hover:border-[#dbeafe] transition-colors">
              <Globe className="w-3.5 h-3.5" /> {lang === "en" ? "Español" : "English"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
