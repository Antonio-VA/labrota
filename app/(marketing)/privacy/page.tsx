"use client"

import Link from "next/link"
import { useLocale } from "next-intl"

const content = {
  en: {
    title: "Privacy Policy",
    updated: "Last updated: April 2026",
    sections: [
      {
        heading: "1. Who we are",
        body: `LabRota ("we", "us", "our") operates the scheduling platform at labrota.app, purpose-built for IVF laboratory management. Our contact email is info@labrota.app.`,
      },
      {
        heading: "2. What data we collect",
        body: `We collect only what is necessary to provide the service:

• **Account data**: name, work email address, and your role within the laboratory.
• **Usage data**: pages visited, features used, and browser/device type — collected via server-side logs only, with no third-party tracking scripts.
• **Rota and scheduling data**: staff rotas, shift assignments, leave records, and skill profiles that you enter into the platform.
• **Communications**: emails you send to info@labrota.app.

We do not collect payment card data (processed by our payment provider under their own privacy policy) or any sensitive personal health information.`,
      },
      {
        heading: "3. Legal basis for processing (GDPR)",
        body: `We process your data on the following legal bases:
• **Contract performance** – to operate your account and provide the service.
• **Legitimate interests** – to improve the platform, maintain security, and prevent fraud.
• **Legal obligation** – to comply with applicable EU and Spanish law where required.`,
      },
      {
        heading: "4. How we use your data",
        body: `Your data is used exclusively to:
• Provide and maintain the LabRota platform.
• Send service-critical emails (account verification, password reset, rota notifications).
• Respond to support requests.
• Analyse aggregated, anonymised usage patterns to improve the product.

We do not sell, rent, or share your personal data with third parties for marketing purposes.`,
      },
      {
        heading: "5. Data storage and security",
        body: `All data is stored on servers located in the European Union (Frankfurt, Germany) operated by Supabase. Data is encrypted at rest and in transit (TLS 1.2+). Access is restricted to authorised personnel only. We maintain regular automated backups.`,
      },
      {
        heading: "6. Data retention",
        body: `We retain your data for as long as your account is active. Upon cancellation or written request, account data is deleted within 30 days, except where we are required to retain it by law (e.g. invoicing records for 7 years under Spanish tax law).`,
      },
      {
        heading: "7. Your rights",
        body: `Under GDPR you have the right to:
• **Access** – request a copy of the personal data we hold about you.
• **Rectification** – ask us to correct inaccurate data.
• **Erasure** – ask us to delete your data ("right to be forgotten").
• **Portability** – receive your data in a machine-readable format.
• **Restriction** – ask us to limit how we use your data.
• **Object** – object to processing based on legitimate interests.

To exercise any of these rights, email info@labrota.app. We will respond within 30 days. You also have the right to lodge a complaint with the Spanish Data Protection Authority (AEPD) at aepd.es.`,
      },
      {
        heading: "8. Cookies",
        body: `LabRota uses only a single functional cookie to store your session and language preference. No advertising or analytics cookies are used. No third-party tracking services (e.g. Google Analytics) are loaded.`,
      },
      {
        heading: "9. Changes to this policy",
        body: `We may update this policy from time to time. When we do, we will update the "Last updated" date above and notify active users by email if the changes are material.`,
      },
      {
        heading: "10. Contact",
        body: `Questions about this policy? Email us at info@labrota.app.`,
      },
    ],
  },
  es: {
    title: "Política de Privacidad",
    updated: "Última actualización: abril 2026",
    sections: [
      {
        heading: "1. Quiénes somos",
        body: `LabRota ("nosotros", "nuestro") opera la plataforma de gestión de turnos en labrota.app, diseñada exclusivamente para laboratorios IVF. Puedes contactarnos en info@labrota.app.`,
      },
      {
        heading: "2. Qué datos recopilamos",
        body: `Solo recopilamos los datos necesarios para prestar el servicio:

• **Datos de cuenta**: nombre, correo electrónico profesional y función dentro del laboratorio.
• **Datos de uso**: páginas visitadas, funciones utilizadas y tipo de navegador/dispositivo — recopilados únicamente mediante registros del servidor, sin scripts de seguimiento de terceros.
• **Datos de rotas y turnos**: rotas del personal, asignaciones de turno, registros de ausencias y perfiles de competencias que introduces en la plataforma.
• **Comunicaciones**: correos electrónicos que nos envíes a info@labrota.app.

No recopilamos datos de tarjetas de pago (gestionados por nuestro proveedor de pagos bajo su propia política) ni información sanitaria personal sensible.`,
      },
      {
        heading: "3. Base jurídica del tratamiento (RGPD)",
        body: `Tratamos tus datos sobre las siguientes bases jurídicas:
• **Ejecución de contrato** – para gestionar tu cuenta y prestar el servicio.
• **Interés legítimo** – para mejorar la plataforma, mantener la seguridad y prevenir fraudes.
• **Obligación legal** – para cumplir con la legislación española y de la UE aplicable.`,
      },
      {
        heading: "4. Cómo usamos tus datos",
        body: `Tus datos se utilizan exclusivamente para:
• Proporcionar y mantener la plataforma LabRota.
• Enviar correos imprescindibles para el servicio (verificación de cuenta, restablecimiento de contraseña, notificaciones de rota).
• Responder a solicitudes de soporte.
• Analizar patrones de uso agregados y anonimizados para mejorar el producto.

No vendemos, alquilamos ni compartimos tus datos personales con terceros con fines comerciales.`,
      },
      {
        heading: "5. Almacenamiento y seguridad de los datos",
        body: `Todos los datos se almacenan en servidores ubicados en la Unión Europea (Fráncfort, Alemania) operados por Supabase. Los datos están cifrados en reposo y en tránsito (TLS 1.2+). El acceso está restringido al personal autorizado. Realizamos copias de seguridad automatizadas de forma periódica.`,
      },
      {
        heading: "6. Conservación de los datos",
        body: `Conservamos tus datos durante el tiempo que tu cuenta esté activa. Tras la cancelación o solicitud escrita, los datos se eliminan en un plazo de 30 días, salvo que la ley nos exija conservarlos (por ejemplo, registros de facturación durante 7 años según la legislación fiscal española).`,
      },
      {
        heading: "7. Tus derechos",
        body: `En virtud del RGPD tienes derecho a:
• **Acceso** – solicitar una copia de los datos personales que conservamos sobre ti.
• **Rectificación** – pedirnos que corrijamos datos inexactos.
• **Supresión** – pedirnos que eliminemos tus datos ("derecho al olvido").
• **Portabilidad** – recibir tus datos en un formato legible por máquina.
• **Limitación** – solicitarnos que restrinjamos el uso de tus datos.
• **Oposición** – oponerte al tratamiento basado en interés legítimo.

Para ejercer cualquiera de estos derechos, escríbenos a info@labrota.app. Responderemos en un plazo de 30 días. También tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) en aepd.es.`,
      },
      {
        heading: "8. Cookies",
        body: `LabRota utiliza únicamente una cookie funcional para almacenar tu sesión y preferencia de idioma. No se utilizan cookies publicitarias ni analíticas. No se cargan servicios de seguimiento de terceros (por ejemplo, Google Analytics).`,
      },
      {
        heading: "9. Cambios en esta política",
        body: `Podemos actualizar esta política periódicamente. Cuando lo hagamos, actualizaremos la fecha de "Última actualización" y notificaremos a los usuarios activos por correo electrónico si los cambios son relevantes.`,
      },
      {
        heading: "10. Contacto",
        body: `¿Tienes preguntas sobre esta política? Escríbenos a info@labrota.app.`,
      },
    ],
  },
}

export default function PrivacyPage() {
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
