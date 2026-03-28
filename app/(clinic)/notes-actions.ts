"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"

// ── Note templates (lab config) ─────────────────────────────────────────────

export async function getNoteTemplates(): Promise<{ id: string; text: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("note_templates")
    .select("id, text")
    .order("created_at")
  return (data ?? []) as { id: string; text: string }[]
}

export async function addNoteTemplate(text: string): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { data, error } = await supabase
    .from("note_templates")
    .insert({ organisation_id: orgId, text } as never)
    .select("id")
    .single()
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return { id: (data as { id: string }).id }
}

export async function updateNoteTemplate(id: string, text: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("note_templates")
    .update({ text, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

export async function deleteNoteTemplate(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase.from("note_templates").delete().eq("id", id).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

// ── Week notes (weekly view) ────────────────────────────────────────────────

export interface WeekNoteData {
  templates: { id: string; text: string }[]
  adHocNotes: { id: string; text: string }[]
  enableNotes: boolean
}

export async function getWeekNotes(weekStart: string): Promise<WeekNoteData> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { templates: [], adHocNotes: [], enableNotes: true }

  const [templatesRes, dismissedRes, adHocRes, configRes] = await Promise.all([
    supabase.from("note_templates").select("id, text").eq("organisation_id", orgId).order("created_at"),
    supabase.from("dismissed_note_templates").select("note_template_id").eq("organisation_id", orgId).eq("week_start", weekStart),
    supabase.from("week_notes").select("id, text").eq("organisation_id", orgId).eq("week_start", weekStart).eq("is_template", false).order("created_at"),
    supabase.from("lab_config").select("enable_notes").eq("organisation_id", orgId).maybeSingle(),
  ])

  const dismissedIds = new Set((dismissedRes.data ?? []).map((d: { note_template_id: string }) => d.note_template_id))
  const templates = ((templatesRes.data ?? []) as { id: string; text: string }[]).filter((t) => !dismissedIds.has(t.id))
  const adHocNotes = (adHocRes.data ?? []) as { id: string; text: string }[]
  const enableNotes = (configRes.data as { enable_notes?: boolean } | null)?.enable_notes ?? true

  return { templates, adHocNotes, enableNotes }
}

export async function addWeekNote(weekStart: string, text: string): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { data, error } = await supabase
    .from("week_notes")
    .insert({ organisation_id: orgId, week_start: weekStart, text, is_template: false } as never)
    .select("id")
    .single()
  if (error) return { error: error.message }
  return { id: (data as { id: string }).id }
}

export async function updateWeekNote(id: string, text: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("week_notes")
    .update({ text, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  return {}
}

export async function deleteWeekNote(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase.from("week_notes").delete().eq("id", id).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  return {}
}

export async function dismissTemplateNote(noteTemplateId: string, weekStart: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { error } = await supabase
    .from("dismissed_note_templates")
    .insert({ organisation_id: orgId, note_template_id: noteTemplateId, week_start: weekStart } as never)
  if (error) return { error: error.message }
  return {}
}
