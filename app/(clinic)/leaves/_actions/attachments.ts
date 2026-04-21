"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"

// Keep in sync with the `accept` attribute on the leave-form file input
// (components/leaves-list/leave-form.tsx). Both extension AND MIME must match
// so a file like `evil.pdf.exe` with a forged content-type is rejected.
const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png", "gif", "webp", "doc", "docx"])
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

/**
 * Upload a leave attachment file (PDF, image, doc). Returns the org-scoped
 * storage path (NOT a URL) to persist on the leave row. Downloads are served
 * via the /api/leave-attachment/[id] proxy, which re-checks org access.
 */
export async function uploadLeaveAttachment(formData: FormData): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const file = formData.get("file") as File
  if (!file || file.size === 0) return { error: "No file provided." }
  if (file.size > 10 * 1024 * 1024) return { error: "File exceeds 10 MB limit." }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!ALLOWED_EXT.has(ext)) {
    return { error: "Unsupported file type. Allowed: PDF, JPG, PNG, GIF, WebP, DOC, DOCX." }
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { error: "Unsupported file content type." }
  }

  const path = `${orgId}/${user.id}/${Date.now()}.${ext}`

  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from("leave-attachments")
    .upload(path, file, { upsert: false, contentType: file.type })
  if (uploadError) return { error: uploadError.message }

  return { path }
}
