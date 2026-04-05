"use client"

import Link from "next/link"
import { useLocale } from "next-intl"

const content = {
  en: {
    title: "GDPR",
    subtitle: "General Data Protection Regulation — Our Commitments",
    updated: "Last updated: April 2026",
    sections: [
      {
        heading: "Our commitment to GDPR",
        body: `LabRota is built for European IVF laboratories and is designed with GDPR compliance as a baseline requirement, not an afterthought. This page explains how we meet our obligations under Regulation (EU) 2016/679.`,
      },
      {
        heading: "Data controller",
        body: `LabRota acts as the **data controller** for the personal data of account holders (laboratory managers, administrators). For staff scheduling data entered by your organisation, LabRota acts as a **data processor** on your behalf, and your organisation is the controller.

Contact: info@labrota.app`,
      },
      {
        heading: "Data processing agreement (DPA)",
        body: `If your organisation requires a formal Data Processing Agreement (DPA) as required under GDPR Article 28, please contact us at info@labrota.app and we will provide one within 5 business days.`,
      },
      {
        heading: "Legal bases for processing",
        body: `We rely on the following legal bases:
• **Article 6(1)(b)** – Processing necessary for the performance of a contract (providing the Service).
• **Article 6(1)(f)** – Legitimate interests (platform security, fraud prevention, service improvement).
• **Article 6(1)(c)** – Legal obligation (tax records, regulatory compliance).`,
      },
      {
        heading: "Data location and transfers",
        body: `All personal data is stored exclusively within the European Union — specifically in Frankfurt, Germany (AWS eu-central-1 region) via Supabase. We do not transfer personal data outside the EEA.`,
      },
      {
        heading: "Data minimisation",
        body: `We collect only the minimum data required to operate the scheduling service:
• Name and work email (account management)
• Role and shift data (core scheduling function)
• Leave and availability records (core scheduling function)

We do not process special categories of personal data (Article 9 GDPR) such as health data, biometric data, or data revealing racial or ethnic origin.`,
      },
      {
        heading: "Your rights under GDPR",
        body: `You have the following rights, which you can exercise by emailing info@labrota.app:

• **Right of access** (Art. 15) – obtain a copy of your personal data.
• **Right to rectification** (Art. 16) – correct inaccurate data.
• **Right to erasure** (Art. 17) – request deletion of your data.
• **Right to restriction** (Art. 18) – limit how your data is processed.
• **Right to data portability** (Art. 20) – receive your data in a structured, machine-readable format.
• **Right to object** (Art. 21) – object to processing based on legitimate interests.

We will respond to all requests within 30 days. In complex cases, we may extend this by a further 60 days with notice.`,
      },
      {
        heading: "Security measures",
        body: `In accordance with Article 32 GDPR, we implement appropriate technical and organisational measures including:
• Encryption at rest and in transit (TLS 1.2+, AES-256).
• Role-based access controls limiting data access to authorised personnel.
• Regular automated backups stored within the EU.
• Multi-factor authentication available for all accounts.
• Regular review of access logs and security practices.`,
      },
      {
        heading: "Data breach notification",
        body: `In the event of a personal data breach that is likely to result in a risk to the rights and freedoms of individuals, we will notify the relevant supervisory authority within 72 hours (Article 33 GDPR). Where the breach is likely to result in a high risk, we will also notify affected users without undue delay (Article 34 GDPR).`,
      },
      {
        heading: "Supervisory authority",
        body: `You have the right to lodge a complaint with your national data protection authority. For users in Spain, this is the Agencia Española de Protección de Datos (AEPD): www.aepd.es.`,
      },
      {
        heading: "Contact",
        body: `For all GDPR-related enquiries, including DPA requests and rights exercises: info@labrota.app`,
      },
    ],
  },
  es: {
    title: "RGPD",
    subtitle: "Reglamento General de Protección de Datos — Nuestros compromisos",
    updated: "Última actualización: abril 2026",
    sections: [
      {
        heading: "Nuestro compromiso con el RGPD",
        body: `LabRota está diseñado para laboratorios IVF europeos y ha sido construido con el cumplimiento del RGPD como requisito de base, no como añadido posterior. Esta página explica cómo cumplimos nuestras obligaciones en virtud del Reglamento (UE) 2016/679.`,
      },
      {
        heading: "Responsable del tratamiento",
        body: `LabRota actúa como **responsable del tratamiento** de los datos personales de los titulares de cuentas (responsables de laboratorio, administradores). Para los datos de planificación de turnos introducidos por tu organización, LabRota actúa como **encargado del tratamiento** en tu nombre, siendo tu organización el responsable del tratamiento.

Contacto: info@labrota.app`,
      },
      {
        heading: "Acuerdo de encargo del tratamiento (DPA)",
        body: `Si tu organización necesita un Acuerdo de Encargo del Tratamiento formal conforme al Artículo 28 del RGPD, contacta con nosotros en info@labrota.app y lo proporcionaremos en un plazo de 5 días hábiles.`,
      },
      {
        heading: "Bases jurídicas del tratamiento",
        body: `Nos apoyamos en las siguientes bases jurídicas:
• **Artículo 6(1)(b)** – Tratamiento necesario para la ejecución de un contrato (prestación del Servicio).
• **Artículo 6(1)(f)** – Interés legítimo (seguridad de la plataforma, prevención de fraude, mejora del servicio).
• **Artículo 6(1)(c)** – Obligación legal (registros fiscales, cumplimiento normativo).`,
      },
      {
        heading: "Ubicación y transferencias de datos",
        body: `Todos los datos personales se almacenan exclusivamente dentro de la Unión Europea — concretamente en Fráncfort, Alemania (región AWS eu-central-1) a través de Supabase. No transferimos datos personales fuera del Espacio Económico Europeo.`,
      },
      {
        heading: "Minimización de datos",
        body: `Solo recopilamos los datos mínimos necesarios para operar el servicio de planificación de turnos:
• Nombre y correo electrónico profesional (gestión de cuenta)
• Función y datos de turnos (función principal de planificación)
• Registros de ausencias y disponibilidad (función principal de planificación)

No tratamos categorías especiales de datos personales (Artículo 9 RGPD), como datos sanitarios, datos biométricos o datos que revelen el origen racial o étnico.`,
      },
      {
        heading: "Tus derechos bajo el RGPD",
        body: `Tienes los siguientes derechos, que puedes ejercer enviando un correo a info@labrota.app:

• **Derecho de acceso** (Art. 15) – obtener una copia de tus datos personales.
• **Derecho de rectificación** (Art. 16) – corregir datos inexactos.
• **Derecho de supresión** (Art. 17) – solicitar la eliminación de tus datos.
• **Derecho de limitación** (Art. 18) – restringir el uso de tus datos.
• **Derecho de portabilidad** (Art. 20) – recibir tus datos en un formato estructurado y legible por máquina.
• **Derecho de oposición** (Art. 21) – oponerte al tratamiento basado en interés legítimo.

Responderemos a todas las solicitudes en un plazo de 30 días. En casos complejos, podemos ampliar este plazo 60 días más con previo aviso.`,
      },
      {
        heading: "Medidas de seguridad",
        body: `De conformidad con el Artículo 32 del RGPD, aplicamos medidas técnicas y organizativas adecuadas, entre ellas:
• Cifrado en reposo y en tránsito (TLS 1.2+, AES-256).
• Controles de acceso basados en roles que limitan el acceso a los datos al personal autorizado.
• Copias de seguridad automatizadas periódicas almacenadas dentro de la UE.
• Autenticación multifactor disponible para todas las cuentas.
• Revisión periódica de registros de acceso y prácticas de seguridad.`,
      },
      {
        heading: "Notificación de brechas de seguridad",
        body: `En caso de una brecha de seguridad que entrañe riesgos para los derechos y libertades de las personas, notificaremos a la autoridad de control competente en un plazo de 72 horas (Artículo 33 del RGPD). Si la brecha implica un riesgo elevado, también notificaremos a los usuarios afectados sin dilación indebida (Artículo 34 del RGPD).`,
      },
      {
        heading: "Autoridad de control",
        body: `Tienes derecho a presentar una reclamación ante tu autoridad nacional de protección de datos. Para usuarios en España, es la Agencia Española de Protección de Datos (AEPD): www.aepd.es.`,
      },
      {
        heading: "Contacto",
        body: `Para todas las consultas relacionadas con el RGPD, incluidas solicitudes de DPA y ejercicio de derechos: info@labrota.app`,
      },
    ],
  },
}

export default function GdprPage() {
  const locale = useLocale()
  const t = locale === "en" ? content.en : content.es

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/" className="text-[13px] text-[#64748b] hover:text-[#1b4f8a] transition-colors mb-8 inline-block">← {locale === "en" ? "Back to home" : "Volver al inicio"}</Link>
      <h1 className="text-[32px] font-bold text-[#0f172a] mb-1">{t.title}</h1>
      <p className="text-[15px] text-[#475569] mb-1">{t.subtitle}</p>
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
