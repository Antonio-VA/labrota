"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { LogOut, Pencil, Check, X, Upload } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { setLocale } from "@/lib/locale-action"
import type { User } from "@supabase/supabase-js"

// ── Avatar + user dropdown ────────────────────────────────────────────────────

function AvatarMenu({ user }: { user: User }) {
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen]           = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [displayName, setDisplayName] = useState<string | null>(
    (user.user_metadata?.full_name as string | undefined) ?? null
  )
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    (user.user_metadata?.avatar_url as string | undefined) ?? null
  )
  const [isSavingName, startSaveName] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  // Focus name input when entering edit mode
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

  function openEdit() {
    setNameDraft(displayName ?? "")
    setEditingName(true)
  }

  function commitName() {
    startSaveName(async () => {
      const supabase = createClient()
      const trimmed = nameDraft.trim() || null
      await supabase.auth.updateUser({ data: { full_name: trimmed } })
      await supabase.from("profiles").update({ full_name: trimmed } as never).eq("id", user.id)
      setDisplayName(trimmed)
      setEditingName(false)
    })
  }

  function cancelEdit() {
    setEditingName(false)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setUploadError(null)
    setIsUploading(true)
    try {
      const supabase = createClient()
      const ext  = file.name.split(".").pop() ?? "jpg"
      const path = `${user.id}.${ext}`
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true })
      if (error) { setUploadError(error.message); return }
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path)
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      setAvatarUrl(publicUrl + `?t=${Date.now()}`)
    } finally {
      setIsUploading(false)
    }
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  function currentInitials() {
    const name = displayName ?? ""
    if (name) return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    return (user.email ?? "").slice(0, 2).toUpperCase()
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        className="flex size-7 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity overflow-hidden shrink-0"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="block size-full object-cover object-center" />
        ) : (
          currentInitials()
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-9 z-50 w-64 rounded-xl border border-border bg-background shadow-lg overflow-hidden">

          {/* Identity */}
          <div className="px-4 py-3 border-b border-border">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={nameInputRef}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")  commitName()
                    if (e.key === "Escape") cancelEdit()
                  }}
                  disabled={isSavingName}
                  placeholder="Nombre completo"
                  className="flex-1 text-[14px] font-medium border-0 border-b border-border bg-transparent outline-none pb-0.5 disabled:opacity-50"
                />
                <button
                  onClick={commitName}
                  disabled={isSavingName}
                  className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                  aria-label="Guardar"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  onClick={cancelEdit}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Cancelar"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <span className="text-[14px] font-medium">{displayName ?? "—"}</span>
                <button
                  onClick={openEdit}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                  aria-label="Editar nombre"
                >
                  <Pencil className="size-3" />
                </button>
              </div>
            )}
            <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{user.email}</p>
          </div>

          {/* Photo upload */}
          <div className="px-4 py-2.5 border-b border-border">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 w-full"
            >
              <Upload className="size-3.5" />
              {isUploading ? "Subiendo…" : "Subir foto"}
            </button>
            {uploadError && (
              <p className="text-[11px] text-destructive mt-1">{uploadError}</p>
            )}
          </div>

          {/* Sign out */}
          <div className="px-4 py-2.5">
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-[13px] text-destructive hover:opacity-80 transition-opacity w-full"
            >
              <LogOut className="size-3.5" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Top bar ───────────────────────────────────────────────────────────────────

export function ClinicTopBar() {
  const locale = useLocale()
  const router = useRouter()

  const [user, setUser]               = useState<User | null>(null)
  const [orgName, setOrgName]         = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user
      if (!u) return
      setUser(u)
      // Fetch org name via profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("organisation_id")
        .eq("id", u.id)
        .single() as { data: { organisation_id: string | null } | null }
      if (profile?.organisation_id) {
        const { data: org } = await supabase
          .from("organisations")
          .select("name")
          .eq("id", profile.organisation_id)
          .single() as { data: { name: string } | null }
        if (org) setOrgName(org.name)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  function toggleLocale() {
    const next = locale === "es" ? "en" : "es"
    startTransition(async () => {
      await setLocale(next as "es" | "en")
      router.refresh()
    })
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <header className="hidden md:flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">

      {/* Left: logo + separator + org name */}
      <div className="flex items-center gap-3">
        <a href="/" className="flex items-center shrink-0">
          <Image
            src="/brand/logo-wordmark.svg"
            alt="LabRota"
            width={88}
            height={18}
            priority
          />
        </a>
        {orgName && (
          <>
            <span className="h-4 border-l border-border" />
            <span className="text-[14px] text-muted-foreground">{orgName}</span>
          </>
        )}
      </div>

      {/* Right: lang toggle + avatar dropdown + sign out */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleLocale}
          disabled={isPending}
          className="text-[11px] font-semibold text-muted-foreground hover:text-foreground tracking-widest transition-colors px-1"
          title={locale === "es" ? "Switch to English" : "Cambiar a Español"}
        >
          {locale === "es" ? "EN" : "ES"}
        </button>

        {user && <AvatarMenu user={user} />}

        <button
          onClick={signOut}
          className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Cerrar sesión"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    </header>
  )
}
