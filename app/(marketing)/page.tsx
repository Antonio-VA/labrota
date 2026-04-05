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
      sub: "Lab managers spend hours every week juggling availability, competencies and compliance — with a constant risk of human error.",
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
      sub: "Purpose-built for IVF laboratories — LabRota understands embryologist competencies, regulatory requirements, and the critical nature of every single shift.",
    },
    features: {
      title: "Everything your IVF lab needs",
      sub: "Built from the ground up for fertility labs — not a generic scheduling tool with a healthcare skin.",
      items: [
        { title: "Intelligent Scheduling", body: "Auto-generate rotas based on staff availability, certified competencies and workload — fair, compliant and conflict-free, in minutes." },
        { title: "Built-in Compliance", body: "Automated HFEA staffing checks, full audit trails and real-time regulatory alerts — always inspection-ready." },
        { title: "Real-time Visibility", body: "A live dashboard for managers and instant notifications for staff — everyone sees the rota the moment it changes." },
        { title: "Workforce Analytics", body: "Track hours, workload distribution and staffing trends to make evidence-based decisions and plan ahead." },
        { title: "Leave Management", body: "Staff request time off in the app, managers approve with one click — leave balances update automatically." },
        { title: "AI Scheduling Assistant", body: "Describe what you need in plain language. Our AI agent builds the optimal rota for you — accounting for every constraint." },
      ],
    },
    how: {
      badge: "How it works",
      title: "From setup to published rota in minutes",
      steps: [
        { title: "Configure your lab", body: "Add your staff, their competencies (embryologist, andrologist, senior, junior), certified técnicas and availability preferences." },
        { title: "Generate with AI", body: "Ask LabRota in plain language to build the rota — it balances workload, respects leave, avoids skill gaps and adapts to your lab's specific técnicas automatically." },
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
        { quote: "LabRota replaced our spreadsheets overnight. We now build fully compliant rotas in minutes instead of spending hours every Monday morning.", name: "Dr. María López", role: "Lab Director — IVF Madrid" },
        { quote: "Finally a tool that actually understands embryologist competencies and HFEA requirements. The compliance checks alone make it worth every penny.", name: "James Whitfield", role: "Senior Embryologist — London Fertility Clinic" },
        { quote: "The AI assistant suggested a rota that covered all our skill gaps — something I'd have almost certainly missed managing it manually.", name: "Dr. Ana García", role: "Lab Manager — Barcelona IVF Centre" },
      ],
    },
    pricing: {
      title: "Simple, transparent pricing",
      sub: "No per-employee fees. One flat price per laboratory.",
      monthly: "Monthly",
      annual: "Annual",
      save: "Save 20%",
      plans: [
        {
          name: "Starter",
          desc: "For small labs getting started",
          monthly: "99",
          annual: "79",
          unit: "/lab/month",
          features: ["Up to 15 staff", "Rota generation", "Leave management", "Email notifications", "Basic reports"],
          cta: "Start Free Trial",
          featured: false,
        },
        {
          name: "Professional",
          desc: "For labs needing compliance & AI",
          monthly: "199",
          annual: "159",
          unit: "/lab/month",
          badge: "Most Popular",
          features: ["Unlimited staff", "Everything in Starter", "HFEA compliance checks", "AI scheduling assistant", "Advanced analytics & PDF export", "Full audit trail", "Priority support"],
          cta: "Start Free Trial",
          featured: true,
        },
        {
          name: "Enterprise",
          desc: "For multi-site clinics & hospitals",
          monthly: "Custom",
          annual: "Custom",
          unit: "",
          features: ["Multiple laboratories", "Everything in Professional", "SSO & advanced security", "Custom integrations", "Dedicated account manager", "99.9% SLA guarantee"],
          cta: "Contact Sales",
          featured: false,
        },
      ],
    },
    cta: {
      title: "Ready to simplify your lab scheduling?",
      sub: "Join IVF laboratories that have replaced spreadsheets with smart, compliant rotas. Book a 30-minute demo — no commitment required.",
      btn: "Request a Demo",
    },
    footer: {
      tagline: "Smart scheduling for IVF laboratories.",
      product: "Product",
      company: "Company",
      legal: "Legal",
      links: {
        features: "Features",
        pricing: "Pricing",
        login: "Log in",
        about: "About",
        blog: "Blog",
        contact: "Contact",
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
      sub: "Diseñado exclusivamente para laboratorios IVF — LabRota entiende las competencias de embriólogos, los requisitos regulatorios y la naturaleza crítica de cada turno.",
    },
    features: {
      title: "Todo lo que tu laboratorio IVF necesita",
      sub: "Construido desde cero para laboratorios de fertilidad — no es otra herramienta genérica de turnos con apariencia sanitaria.",
      items: [
        { title: "Scheduling Inteligente", body: "Genera rotas automáticamente según disponibilidad, competencias certificadas y carga de trabajo — justa, conforme y sin conflictos, en minutos." },
        { title: "Compliance Integrado", body: "Verificaciones automáticas de personal HFEA, trazabilidad completa y alertas regulatorias en tiempo real — siempre listo para inspecciones." },
        { title: "Visibilidad en Tiempo Real", body: "Dashboard en directo para managers y notificaciones instantáneas para el equipo — todos ven la rota en el momento en que cambia." },
        { title: "Analytics de Workforce", body: "Monitoriza horas, distribución de carga y tendencias de personal para tomar decisiones basadas en datos y planificar con antelación." },
        { title: "Gestión de Ausencias", body: "El equipo solicita ausencias en la app, los managers aprueban con un clic — los saldos se actualizan automáticamente en la rota." },
        { title: "Asistente IA de Scheduling", body: "Describe lo que necesitas en lenguaje natural. Nuestro agente IA construye la rota óptima teniendo en cuenta cada restricción." },
      ],
    },
    how: {
      badge: "Cómo funciona",
      title: "De la configuración a la rota publicada en minutos",
      steps: [
        { title: "Configura tu laboratorio", body: "Añade tu equipo, sus competencias (embriólogo, andrólogo, senior, junior), técnicas certificadas y preferencias de disponibilidad." },
        { title: "Genera con IA", body: "Pide a LabRota en lenguaje natural que construya la rota — equilibra la carga, respeta las ausencias, evita los skill gaps y se adapta a las técnicas específicas de tu laboratorio." },
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
        { quote: "LabRota sustituyó nuestras hojas de cálculo de la noche a la mañana. Ahora creamos rotas totalmente conformes en minutos en lugar de pasar horas cada lunes.", name: "Dra. María López", role: "Directora de Laboratorio — IVF Madrid" },
        { quote: "Por fin una herramienta que realmente entiende las competencias de los embriólogos y los requisitos HFEA. Solo las verificaciones de compliance ya merecen la pena.", name: "James Whitfield", role: "Embriólogo Senior — London Fertility Clinic" },
        { quote: "El asistente IA sugirió una rota que cubría todos nuestros skill gaps — algo que casi con seguridad habría pasado por alto gestionándolo manualmente.", name: "Dra. Ana García", role: "Lab Manager — Barcelona IVF Centre" },
      ],
    },
    pricing: {
      title: "Precios simples y transparentes",
      sub: "Sin coste por empleado. Un precio fijo por laboratorio.",
      monthly: "Mensual",
      annual: "Anual",
      save: "Ahorra 20%",
      plans: [
        {
          name: "Starter",
          desc: "Para laboratorios pequeños que empiezan",
          monthly: "99",
          annual: "79",
          unit: "/lab/mes",
          features: ["Hasta 15 empleados", "Generación de rotas", "Gestión de ausencias", "Notificaciones por email", "Informes básicos"],
          cta: "Prueba Gratuita",
          featured: false,
        },
        {
          name: "Professional",
          desc: "Para labs que necesitan compliance e IA",
          monthly: "199",
          annual: "159",
          unit: "/lab/mes",
          badge: "Más Popular",
          features: ["Empleados ilimitados", "Todo lo de Starter", "Verificaciones HFEA", "Asistente IA de scheduling", "Analytics avanzados y exportación PDF", "Registro de auditoría completo", "Soporte prioritario"],
          cta: "Prueba Gratuita",
          featured: true,
        },
        {
          name: "Enterprise",
          desc: "Para clínicas multi-sede y hospitales",
          monthly: "A medida",
          annual: "A medida",
          unit: "",
          features: ["Múltiples laboratorios", "Todo lo de Professional", "SSO y seguridad avanzada", "Integraciones personalizadas", "Account manager dedicado", "Garantía SLA 99.9%"],
          cta: "Contactar Ventas",
          featured: false,
        },
      ],
    },
    cta: {
      title: "¿Listo para simplificar la planificación de tu laboratorio?",
      sub: "Únete a los laboratorios IVF que han sustituido las hojas de cálculo por rotas inteligentes y conformes. Reserva una demo de 30 minutos — sin compromiso.",
      btn: "Solicitar una Demo",
    },
    footer: {
      tagline: "Scheduling inteligente para laboratorios IVF.",
      product: "Producto",
      company: "Empresa",
      legal: "Legal",
      links: {
        features: "Funciones",
        pricing: "Precios",
        login: "Iniciar sesión",
        about: "Nosotros",
        blog: "Blog",
        contact: "Contacto",
        privacy: "Política de Privacidad",
        terms: "Términos de Servicio",
        gdpr: "GDPR",
      },
      copy: "© 2026 LabRota. Todos los derechos reservados.",
    },
  },
} as const

type Lang = keyof typeof content

// ─── Feature icons ────────────────────────────────────────────────────────────

const featureIcons = [Calendar, ShieldCheck, Eye, BarChart3, CalendarOff, Sparkles]
const painIcons = [AlertTriangle, Clock, UserX]

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ width = 120, height = 26 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 220 46" width={width} height={height} aria-label="LabRota">
      <text x="0" y="36" fontFamily="Inter,Arial,sans-serif" fontSize="44" fontWeight="300" fill="#1B4F8A">lab</text>
      <text x="63" y="36" fontFamily="Inter,Arial,sans-serif" fontSize="44" fontWeight="700" fill="#1B4F8A">rota</text>
      <rect x="0" y="42" width="158" height="2.5" rx="1.2" fill="#2E86AB" />
    </svg>
  )
}

// ─── Product mockup ───────────────────────────────────────────────────────────

function ProductMockup() {
  return (
    <div className="rounded-2xl border border-[#ccddee] overflow-hidden shadow-[0_24px_80px_rgba(27,79,138,0.14),0_4px_16px_rgba(27,79,138,0.08)]">
      {/* Browser bar */}
      <div className="bg-[#f8fafc] border-b border-[#ccddee] px-4 py-2.5 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <div className="flex-1 text-center text-[11px] text-[#64748b] font-medium bg-white border border-[#ccddee] rounded px-3 py-0.5 max-w-[200px] mx-auto">
          app.labrota.app
        </div>
      </div>
      {/* Content */}
      <div className="bg-white p-5">
        {/* Header row */}
        <div className="flex justify-between items-center mb-4">
          <span className="text-[15px] font-bold text-[#0f172a]">April 2026 — Week View</span>
          <div className="flex gap-1">
            {["Week", "Month", "Day"].map((v, i) => (
              <button key={v} className={`px-3 py-1 rounded-md text-[11px] font-semibold ${i === 0 ? "bg-[#1b4f8a] text-white" : "bg-[#eff6ff] text-[#1b4f8a]"}`}>{v}</button>
            ))}
          </div>
        </div>
        {/* Grid */}
        <div className="grid grid-cols-[72px_repeat(5,1fr)] gap-1 mb-1">
          <div />
          {["Mon 7", "Tue 8", "Wed 9", "Thu 10", "Fri 11"].map(d => (
            <div key={d} className="text-[10px] font-semibold text-[#94a3b8] text-center py-1">{d}</div>
          ))}
        </div>
        {[
          { name: "Dr. López", role: "Senior Emb.", color: "#2563eb", shifts: ["am","pm","am","off","am"] },
          { name: "J. Smith",  role: "Embryol.",    color: "#2563eb", shifts: ["pm","am","am","am","pm"] },
          { name: "A. García", role: "Androlog.",   color: "#059669", shifts: ["am","am","off","pm","am"] },
          { name: "L. Chen",   role: "Junior Emb.", color: "#2563eb", shifts: ["am","pm","pm","am","off"] },
        ].map(row => (
          <div key={row.name} className="grid grid-cols-[72px_repeat(5,1fr)] gap-1 mt-1">
            <div className="flex flex-col justify-center">
              <span className="text-[10px] font-semibold text-[#0f172a]">{row.name}</span>
              <span className="text-[9px] font-bold" style={{ color: row.color }}>{row.role}</span>
            </div>
            {row.shifts.map((s, i) => {
              const styles = s === "off"
                ? "bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]"
                : s === "am"
                ? "bg-[#eff6ff] text-[#1d4ed8] border-[#dbeafe]"
                : "bg-[#f0fdf4] text-[#15803d] border-[#d1fae5]"
              return (
                <div key={i} className={`rounded-md border text-[10px] font-bold text-center py-1.5 ${styles}`}>
                  {s.toUpperCase()}
                </div>
              )
            })}
          </div>
        ))}
        {/* Badges */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {[
            { label: "HFEA Compliant", color: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" },
            { label: "No Skill Gaps",  color: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" },
            { label: "✨ AI Generated", color: "bg-[#eff6ff] text-[#1b4f8a] border-[#dbeafe]" },
          ].map(b => (
            <span key={b.label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[9px] font-bold ${b.color}`}>
              {b.label !== "✨ AI Generated" && <Check className="w-2.5 h-2.5" />}
              {b.label}
            </span>
          ))}
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
            <div className="w-px h-5 bg-[#ccddee] mx-1" />
            <button onClick={switchLang} className="flex items-center gap-1.5 text-[13px] font-medium text-[#64748b] border border-[#ccddee] rounded-lg px-2.5 py-1.5 hover:text-[#1b4f8a] hover:border-[#dbeafe] hover:bg-[#eff6ff] transition-colors">
              <Globe className="w-3.5 h-3.5" />
              {lang === "en" ? "ES" : "EN"}
            </button>
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
              <button onClick={switchLang} className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#64748b] border border-[#ccddee] rounded-lg py-2.5 hover:bg-[#f8fafc]">
                <Globe className="w-3.5 h-3.5" /> {lang === "en" ? "Español" : "English"}
              </button>
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
            { Icon: FileWarning,   title: t.problem.p3title, body: t.problem.p3, iconBg: "bg-[#fef2f2]", iconColor: "text-[#ef4444]" },
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

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {t.pricing.plans.map(plan => (
            <div
              key={plan.name}
              className={`rounded-xl bg-white p-8 relative ${plan.featured ? "border-2 border-[#1b4f8a]" : "border border-[#ccddee]"}`}
            >
              {"badge" in plan && plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#1b4f8a] text-white text-[11px] font-bold px-4 py-1 rounded-full whitespace-nowrap">
                  {plan.badge}
                </div>
              )}
              <div className="text-[20px] font-bold mb-1">{plan.name}</div>
              <div className="text-[13px] text-[#94a3b8] mb-5">{plan.desc}</div>
              <div className="mb-6">
                {plan.monthly !== "Custom" && plan.monthly !== "A medida" ? (
                  <>
                    <span className="text-[24px] font-bold text-[#64748b] align-top leading-[1.7]">€</span>
                    <span className="text-[48px] font-extrabold tracking-tight">
                      {annual ? plan.annual : plan.monthly}
                    </span>
                    <span className="text-[13px] text-[#94a3b8] ml-1">{plan.unit}</span>
                  </>
                ) : (
                  <span className="text-[30px] font-bold">{annual ? plan.annual : plan.monthly}</span>
                )}
              </div>
              <ul className="flex flex-col gap-2.5 mb-7">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-[14px] text-[#374151] leading-snug">
                    <Check className="w-3.5 h-3.5 text-[#16a34a] flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="#contact"
                className={`block text-center py-3 rounded-xl text-[14px] font-semibold transition-all ${
                  plan.featured
                    ? "bg-[#1b4f8a] text-white hover:bg-[#164070] hover:-translate-y-0.5 hover:shadow-md"
                    : "bg-white text-[#1b4f8a] border-[1.5px] border-[#1b4f8a] hover:bg-[#eff6ff]"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Logo width={110} height={24} />
              <p className="text-[13px] text-[#94a3b8] mt-3 leading-relaxed max-w-[220px]">{t.footer.tagline}</p>
            </div>
            {([
              { heading: t.footer.product, links: [{ label: t.footer.links.features, href: "#features" }, { label: t.footer.links.pricing, href: "#pricing" }, { label: t.footer.links.login, href: "/login" }] },
              { heading: t.footer.company, links: [{ label: t.footer.links.about, href: "#" }, { label: t.footer.links.blog, href: "#" }, { label: t.footer.links.contact, href: "#contact" }] },
              { heading: t.footer.legal,   links: [{ label: t.footer.links.privacy, href: "#" }, { label: t.footer.links.terms, href: "#" }, { label: t.footer.links.gdpr, href: "#" }] },
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
