"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { renameOrganisation, deleteOrganisation, toggleOrgStatus, updateOrgLogo } from "@/app/admin/actions"
import { Check, X, Pencil, MoreHorizontal, Trash2, Upload } from "lucide-react"

interface Org {
  id: string
  name: string
  slug: string
  is_active: boolean
  logo_url: string | null
}

export function AdminOrgHeaderActions({ org }: { org: Org }) {
  const router = useRouter()

  // ── Logo state ──────────────────────────────────────────────────────────────
  const [logoUrl, setLogoUrl]         = useState<string | null>(org.logo_url)
  const [isUploading, setIsUploading] = useState(false)
  const [logoError, setLogoError]     = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("El archivo no puede superar 5MB")
      return
    }
    setLogoError(null)
    setIsUploading(true)
    try {
      const supabase = createClient()
      const ext  = file.name.split(".").pop() ?? "png"
      const path = `${org.id}/logo.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("org-logos")
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) { setLogoError(uploadError.message); return }
      const { data: { publicUrl } } = supabase.storage.from("org-logos").getPublicUrl(path)
      let result: { error?: string } | undefined
      try {
        result = await updateOrgLogo(org.id, publicUrl) ?? undefined
      } catch (err) {
        setLogoError(err instanceof Error ? err.message : "Error al guardar el logo")
        return
      }
      if (result?.error) { setLogoError(result.error); return }
      setLogoUrl(publicUrl + `?t=${Date.now()}`)
      router.refresh()
    } finally {
      setIsUploading(false)
    }
  }

  function orgInitials() {
    return org.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
  }

  // ── Rename state ────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing]   = useState(false)
  const [draftName, setDraftName]   = useState(org.name)
  const [renameError, setRenameError] = useState("")
  const [isRenaming, startRename]   = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  function openEdit() {
    setDraftName(org.name)
    setRenameError("")
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setRenameError("")
  }

  function commitRename() {
    if (!draftName.trim() || draftName.trim() === org.name) {
      setIsEditing(false)
      return
    }
    startRename(async () => {
      const result = await renameOrganisation(org.id, draftName)
      if (result?.error) {
        setRenameError(result.error)
      } else {
        setIsEditing(false)
        setRenameError("")
      }
    })
  }

  // ── Overflow menu state ──────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen]   = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [menuOpen])

  // ── Delete modal state ───────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen]       = useState(false)
  const [confirmSlug, setConfirmSlug]     = useState("")
  const [deleteError, setDeleteError]     = useState("")
  const [isDeleting, startDelete]         = useTransition()
  const [isSuspending, startSuspend]      = useTransition()

  function openDeleteModal() {
    setMenuOpen(false)
    setConfirmSlug("")
    setDeleteError("")
    setDeleteOpen(true)
  }

  function commitDelete() {
    startDelete(async () => {
      const result = await deleteOrganisation(org.id)
      if (result?.error) {
        setDeleteError(result.error)
      } else {
        router.push("/")
      }
    })
  }

  function handleSuspend() {
    setMenuOpen(false)
    startSuspend(async () => {
      await toggleOrgStatus(org.id, org.is_active)
    })
  }

  const canDelete = confirmSlug === org.slug

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">

        {/* Left: logo + name + badge + slug */}
        <div className="flex items-center gap-3">
          {/* Logo upload */}
          <div className="relative group shrink-0">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={isUploading}
              aria-label="Upload organisation logo"
              className="flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-[14px] font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors overflow-hidden relative disabled:opacity-50"
            >
              {logoUrl ? (
                <img src={logoUrl} alt={org.name} className="size-full object-contain p-1" />
              ) : (
                orgInitials()
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                <Upload className="size-4 text-white" />
              </span>
            </button>
            {logoError && (
              <p className="absolute top-full mt-1 left-0 text-[11px] text-destructive whitespace-nowrap">{logoError}</p>
            )}
          </div>

          {/* Name / inline rename */}
          <div className="flex flex-col gap-0.5">
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  ref={inputRef}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename()
                    if (e.key === "Escape") cancelEdit()
                  }}
                  disabled={isRenaming}
                  className="h-8 text-[16px] font-medium w-56"
                />
                <button
                  onClick={commitRename}
                  disabled={isRenaming || !draftName.trim()}
                  aria-label="Confirm rename"
                  className="flex items-center justify-center size-7 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                >
                  <Check className="size-4" />
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={isRenaming}
                  aria-label="Cancel rename"
                  className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="size-4" />
                </button>
                {renameError && (
                  <span className="text-[13px] text-destructive ml-1">{renameError}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-medium">{org.name}</h1>
                <Badge variant={org.is_active ? "active" : "inactive"}>
                  {org.is_active ? "Active" : "Suspended"}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Right: Suspend + ... overflow */}
        <div className="flex items-center gap-2">
          <form action={toggleOrgStatus.bind(null, org.id, org.is_active)}>
            <Button
              type="submit"
              variant={org.is_active ? "destructive" : "outline"}
              size="sm"
              disabled={isSuspending}
            >
              {org.is_active ? "Suspend" : "Activate"}
            </Button>
          </form>

          {/* Overflow menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              className="flex items-center justify-center size-8 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <MoreHorizontal className="size-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-9 z-50 min-w-[160px] rounded-lg border border-border bg-background shadow-md py-1">
                <button
                  onClick={openDeleteModal}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-destructive hover:bg-muted transition-colors"
                >
                  <Trash2 className="size-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !isDeleting && setDeleteOpen(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="size-4 text-destructive" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-destructive">Eliminar organización</h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>

            {/* Warning */}
            <p className="text-[14px] text-foreground leading-relaxed">
              Se eliminarán permanentemente todos los <strong>turnos</strong>, <strong>guardias</strong>,{" "}
              <strong>ausencias</strong> y <strong>personal</strong> de{" "}
              <span className="font-medium">{org.name}</span>. Los usuarios de autenticación se conservarán
              pero perderán el acceso a esta organización.
            </p>

            {/* Slug confirmation */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground">
                Escribe <span className="font-mono font-medium text-foreground">{org.slug}</span> para confirmar
              </label>
              <Input
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                placeholder={org.slug}
                disabled={isDeleting}
                className="font-mono"
              />
            </div>

            {deleteError && (
              <p className="text-[13px] text-destructive">{deleteError}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={commitDelete}
                disabled={!canDelete || isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete organisation"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
