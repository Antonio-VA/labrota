"use client"

import Link from "next/link"
import { useLocale } from "next-intl"

const content = {
  en: {
    title: "Terms of Service",
    updated: "Last updated: April 2026",
    sections: [
      {
        heading: "1. Acceptance of terms",
        body: `By accessing or using LabRota ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. These terms apply to all users, including laboratory administrators and staff members.`,
      },
      {
        heading: "2. Description of the Service",
        body: `LabRota is a cloud-based staff scheduling platform designed for IVF and fertility laboratories. It provides rota generation, leave management, competency tracking, AI-assisted scheduling, and related tools. The Service is provided on a subscription basis.`,
      },
      {
        heading: "3. Account registration",
        body: `You must provide accurate, current information when creating an account. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must notify us immediately at info@labrota.app if you suspect unauthorised access.`,
      },
      {
        heading: "4. Acceptable use",
        body: `You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:
• Use the Service to store or transmit sensitive patient health data (the Service is designed for staff scheduling, not clinical records).
• Attempt to gain unauthorised access to any part of the platform or its infrastructure.
• Reverse-engineer, decompile, or copy any part of the Service.
• Use the Service in a way that could damage, overload, or impair our systems.`,
      },
      {
        heading: "5. Subscription and payment",
        body: `Access to the full Service requires a paid subscription. Subscription fees are billed in advance on a monthly or annual basis. All fees are non-refundable except where required by law. We reserve the right to change pricing with 30 days' notice to active subscribers.`,
      },
      {
        heading: "6. Data ownership",
        body: `You retain full ownership of all data you upload or create within the Service (staff rotas, schedules, leave records, etc.). By using the Service, you grant LabRota a limited licence to process and store this data solely to provide the Service. We will never use your data to train AI models or for any purpose beyond operating the platform.`,
      },
      {
        heading: "7. Availability and uptime",
        body: `We aim to provide a reliable service but do not guarantee uninterrupted availability. Scheduled maintenance will be communicated in advance where possible. We are not liable for losses arising from temporary unavailability.`,
      },
      {
        heading: "8. Termination",
        body: `You may cancel your subscription at any time by contacting info@labrota.app. Cancellation takes effect at the end of the current billing period. We may suspend or terminate accounts that violate these Terms, with or without prior notice depending on the severity of the violation.`,
      },
      {
        heading: "9. Limitation of liability",
        body: `To the maximum extent permitted by applicable law, LabRota shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service. Our total liability for any claim shall not exceed the amount you paid to us in the 12 months preceding the claim.`,
      },
      {
        heading: "10. Governing law",
        body: `These Terms are governed by the laws of Spain. Any disputes shall be subject to the exclusive jurisdiction of the courts of Spain, without prejudice to any mandatory consumer protection rights you may have under EU law.`,
      },
      {
        heading: "11. Changes to these Terms",
        body: `We may update these Terms from time to time. We will notify active users by email at least 14 days before material changes take effect. Continued use of the Service after that date constitutes acceptance of the revised Terms.`,
      },
      {
        heading: "12. Contact",
        body: `Questions about these Terms? Email us at info@labrota.app.`,
      },
    ],
  },
  es: {
    title: "Términos de Servicio",
    updated: "Última actualización: abril 2026",
    sections: [
      {
        heading: "1. Aceptación de los términos",
        body: `Al acceder o utilizar LabRota ("el Servicio"), aceptas quedar vinculado por estos Términos de Servicio. Si no estás de acuerdo, no uses el Servicio. Estos términos se aplican a todos los usuarios, incluidos administradores de laboratorio y personal.`,
      },
      {
        heading: "2. Descripción del Servicio",
        body: `LabRota es una plataforma de gestión de turnos en la nube diseñada para laboratorios IVF y de fertilidad. Proporciona generación de rotas, gestión de ausencias, seguimiento de competencias, horarios asistidos por IA y herramientas relacionadas. El Servicio se presta mediante suscripción.`,
      },
      {
        heading: "3. Registro de cuenta",
        body: `Debes proporcionar información veraz y actualizada al crear una cuenta. Eres responsable de mantener la confidencialidad de tus credenciales de acceso y de toda la actividad realizada con tu cuenta. Debes notificarnos de inmediato a info@labrota.app si sospechas un acceso no autorizado.`,
      },
      {
        heading: "4. Uso aceptable",
        body: `Aceptas utilizar el Servicio solo para fines lícitos y de conformidad con estos Términos. Está prohibido:
• Usar el Servicio para almacenar o transmitir datos sanitarios sensibles de pacientes (el Servicio está diseñado para la planificación de turnos, no para registros clínicos).
• Intentar acceder sin autorización a cualquier parte de la plataforma o su infraestructura.
• Realizar ingeniería inversa, descompilar o copiar cualquier parte del Servicio.
• Usar el Servicio de un modo que pueda dañar, sobrecargar o deteriorar nuestros sistemas.`,
      },
      {
        heading: "5. Suscripción y pago",
        body: `El acceso completo al Servicio requiere una suscripción de pago. Las cuotas se facturan por adelantado con periodicidad mensual o anual. Todas las cuotas son no reembolsables salvo lo exigido por la ley. Nos reservamos el derecho a modificar los precios con 30 días de antelación notificada a los suscriptores activos.`,
      },
      {
        heading: "6. Propiedad de los datos",
        body: `Conservas la plena propiedad de todos los datos que subas o crees dentro del Servicio (rotas, horarios, registros de ausencias, etc.). Al usar el Servicio, concedes a LabRota una licencia limitada para procesar y almacenar estos datos exclusivamente con el fin de prestar el Servicio. Nunca utilizaremos tus datos para entrenar modelos de IA ni para ningún propósito ajeno a la operación de la plataforma.`,
      },
      {
        heading: "7. Disponibilidad",
        body: `Nos esforzamos por ofrecer un servicio fiable, pero no garantizamos la disponibilidad ininterrumpida. El mantenimiento programado se comunicará con antelación siempre que sea posible. No somos responsables de las pérdidas derivadas de interrupciones temporales del servicio.`,
      },
      {
        heading: "8. Terminación",
        body: `Puedes cancelar tu suscripción en cualquier momento contactando con info@labrota.app. La cancelación surte efecto al final del período de facturación en curso. Podemos suspender o cancelar cuentas que incumplan estos Términos, con o sin previo aviso según la gravedad del incumplimiento.`,
      },
      {
        heading: "9. Limitación de responsabilidad",
        body: `En la máxima medida permitida por la ley aplicable, LabRota no será responsable de daños indirectos, incidentales o consecuentes derivados del uso del Servicio. Nuestra responsabilidad total por cualquier reclamación no superará el importe que nos hayas abonado en los 12 meses anteriores a la reclamación.`,
      },
      {
        heading: "10. Legislación aplicable",
        body: `Estos Términos se rigen por la legislación española. Cualquier disputa estará sujeta a la jurisdicción exclusiva de los tribunales de España, sin perjuicio de los derechos de protección del consumidor que pueda tener en virtud del derecho de la UE.`,
      },
      {
        heading: "11. Cambios en estos Términos",
        body: `Podemos actualizar estos Términos periódicamente. Notificaremos a los usuarios activos por correo electrónico con al menos 14 días de antelación antes de que entren en vigor cambios relevantes. El uso continuado del Servicio tras esa fecha implica la aceptación de los Términos revisados.`,
      },
      {
        heading: "12. Contacto",
        body: `¿Tienes preguntas sobre estos Términos? Escríbenos a info@labrota.app.`,
      },
    ],
  },
}

export default function TermsPage() {
  const locale = useLocale()
  const t = locale === "en" ? content.en : content.es

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/" className="text-[13px] text-[#64748b] hover:text-[#1b4f8a] transition-colors mb-8 inline-block">← {locale === "en" ? "Back to home" : "Volver al inicio"}</Link>
      <h1 className="text-[32px] font-bold text-[#0f172a] mb-2">{t.title}</h1>
      <p className="text-[13px] text-[#94a3b8] mb-10">{t.updated}</p>
      <div className="flex flex-col gap-8">
        {t.sections.map((s) => (
          <div key={s.heading}>
            <h2 className="text-[17px] font-semibold text-[#0f172a] mb-3">{s.heading}</h2>
            <div className="text-[14px] text-[#475569] leading-relaxed whitespace-pre-line">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
