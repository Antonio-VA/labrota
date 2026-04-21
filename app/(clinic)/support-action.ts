"use server"

import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"

export async function sendSupportMessage(subject: string, message: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const from = user?.email ?? "unknown"
  const name = (user?.user_metadata?.full_name as string) ?? from

  const result = await sendEmail({
    to: "antonio.grit@gmail.com",
    replyTo: from,
    subject: `[LabRota Support] ${subject}`,
    text: `De: ${name} (${from})\n\n${message}`,
  })

  if (!result.ok) {
    console.error("Support email failed:", result.error)
    return { error: "Failed to send message. Please try again." }
  }
  return {}
}
