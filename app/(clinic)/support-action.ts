"use server"

import { createClient } from "@/lib/supabase/server"

export async function sendSupportMessage(subject: string, message: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const from = user?.email ?? "unknown"
  const name = (user?.user_metadata?.full_name as string) ?? from

  // Send via Supabase Edge Function or direct SMTP
  // For now, use a simple fetch to a mailto-compatible endpoint
  // In production, replace with Resend/SendGrid/Supabase Edge Function
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        from: "LabRota <onboarding@resend.dev>",
        to: "antonio.grit@gmail.com",
        reply_to: from,
        subject: `[LabRota Support] ${subject}`,
        text: `De: ${name} (${from})\n\n${message}`,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error("Support email failed:", body)
      return { error: "Failed to send message. Please try again." }
    }
    return {}
  } catch (e) {
    console.error("Support email error:", e)
    return { error: "Failed to send message." }
  }
}
