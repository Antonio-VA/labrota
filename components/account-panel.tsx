"use client"

import { useState, useEffect, useTransition } from "react"
import { useRef } from "react"
import { X, Sun, Moon, Monitor, Check, Camera } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getUserPreferences,
  getUserDepartment,
  saveUserPreferences,
  uploadAvatar,
  type UserPreferences,
} from "@/app/(clinic)/account-actions"
import type { User } from "@supabase/supabase-js"

const ACCENT_COLORS = [
  { key: "blue",    hex: "#1b4f8a", label: "Azul clínico" },
  { key: "indigo",  hex: "#4f46e5", label: "Índigo" },
  { key: "violet",  hex: "#7c3aed", label: "Violeta" },
  { key: "emerald", hex: "#059669", label: "Esmeralda" },
  { key: "rose",    hex: "#e11d48", label: "Rosa" },
  { key: "amber",   hex: "#d97706", label: "Ámbar" },
  { key: "slate",   hex: "#475569", label: "Grafito" },
]

const THEME_OPTIONS: { key: UserPreferences["theme"]; label: string; icon: React.ReactNode }[] = [
  { key: "light", label: "Claro",      icon: <Sun className="size-4" /> },
  { key: "dark",  label: "Oscuro",     icon: <Moon className="size-4" /> },
  { key: "auto",  label: "Automático", icon: <Monitor className="size-4" /> },
]

export function AccountPanel({ open, onClose, user }: {
  open: boolean
  onClose: () => void
  user: User | null
}) {
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    if (typeof window === "undefined") return { locale: "browser", theme: "light", accentColor: "#1b4f8a" }
    try {
      const saved = JSON.parse(localStorage.getItem("labrota_theme") || "{}")
      return { locale: "browser", theme: saved.theme ?? "light", accentColor: saved.accentColor ?? "#1b4f8a" }
    } catch { return { locale: "browser", theme: "light", accentColor: "#1b4f8a" } }
  })
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [department, setDepartment] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !user) return
    setLoading(true)
    Promise.all([getUserPreferences(), getUserDepartment()]).then(([p, dept]) => {
      setPrefs({
        locale: p.locale ?? "browser",
        theme: p.theme ?? "light",
        accentColor: p.accentColor ?? "#1b4f8a",
      })
      setDepartment(dept)
      setLoading(false)
    })
  }, [open, user])

  function handleSave() {
    startTransition(async () => {
      const result = await saveUserPreferences(prefs)
      if (result.error) { toast.error(result.error); return }
      // Apply theme immediately
      applyTheme(prefs)
      toast.success("Preferencias guardadas")
      onClose()
    })
  }

  const firstName = (user?.user_metadata?.full_name as string)?.split(" ")[0] ?? ""
  const initials = firstName ? firstName.slice(0, 2).toUpperCase() : (user?.email ?? "").slice(0, 2).toUpperCase()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    (user?.user_metadata?.avatar_url as string) ?? null
  )
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append("avatar", file)
    const result = await uploadAvatar(fd)
    setUploading(false)
    if (result.error) { toast.error(result.error); return }
    if (result.url) { setAvatarUrl(result.url); toast.success("Foto actualizada") }
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}

      <div className={cn(
        "fixed right-0 top-0 bottom-0 z-50 bg-background border-l border-border shadow-xl",
        "flex flex-col transition-transform duration-200 ease-out w-[360px]",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="text-[15px] font-medium">Mi cuenta</p>
          <button onClick={onClose} className="size-7 flex items-center justify-center rounded hover:bg-muted">
            <X className="size-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Profile */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-3">Perfil</p>
            <div className="flex items-center gap-3 mb-3">
              {/* Avatar with upload */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="relative size-14 rounded-full shrink-0 overflow-hidden group"
                style={{ background: prefs.accentColor ?? "#1b4f8a" }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center size-full text-[18px] font-bold text-white">{initials}</span>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="size-4 text-white" />
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-[10px] text-white font-medium">…</span>
                  </div>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              <div className="min-w-0">
                <p className="text-[14px] font-medium truncate">{user?.user_metadata?.full_name ?? "—"}</p>
                <p className="text-[12px] text-muted-foreground truncate">{user?.email ?? "—"}</p>
                {department && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {department === "admin" ? "Administrador" : department === "lab" ? "Embriología" : department === "andrology" ? "Andrología" : department}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">Pulsa la foto para cambiar</p>
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-3">Idioma</p>
            <select
              value={prefs.locale}
              onChange={(e) => setPrefs((p) => ({ ...p, locale: e.target.value as UserPreferences["locale"] }))}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="browser">Idioma del navegador (predeterminado)</option>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Appearance — Theme */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-3">Apariencia</p>

            <p className="text-[12px] text-muted-foreground font-medium mb-2">Modo</p>
            <div className="flex gap-2 mb-4">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPrefs((p) => ({ ...p, theme: opt.key }))}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-all text-[12px]",
                    prefs.theme === opt.key
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            <p className="text-[12px] text-muted-foreground font-medium mb-2">Color de acento</p>
            <div className="flex gap-2 flex-wrap">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setPrefs((p) => ({ ...p, accentColor: c.hex }))}
                  title={c.label}
                  className={cn(
                    "size-8 rounded-full border-2 flex items-center justify-center transition-all",
                    prefs.accentColor === c.hex
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105"
                  )}
                  style={{ background: c.hex }}
                >
                  {prefs.accentColor === c.hex && <Check className="size-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 shrink-0 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isPending || loading}>
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </>
  )
}

/** Apply theme preferences to the document */
export function applyTheme(prefs: UserPreferences) {
  const root = document.documentElement

  // Persist to localStorage + cookie (cookie is read server-side in layout.tsx)
  const themeData = JSON.stringify({ theme: prefs.theme, accentColor: prefs.accentColor })
  try {
    localStorage.setItem("labrota_theme", themeData)
    document.cookie = `labrota_theme=${encodeURIComponent(themeData)};path=/;max-age=${365 * 86400};SameSite=Lax`
  } catch {}

  // Accent colour — override --primary in both light and dark
  if (prefs.accentColor) {
    root.style.setProperty("--primary", prefs.accentColor)
    root.style.setProperty("--ring", prefs.accentColor)
    root.style.setProperty("--sidebar-primary", prefs.accentColor)
    root.style.setProperty("--sidebar-ring", prefs.accentColor)
  }

  // Dark mode via data-theme attribute (matches CSS selectors in globals.css)
  if (prefs.theme === "dark") {
    root.setAttribute("data-theme", "dark")
  } else if (prefs.theme === "light") {
    root.removeAttribute("data-theme")
  } else {
    // auto — follow system
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    if (prefersDark) root.setAttribute("data-theme", "dark")
    else root.removeAttribute("data-theme")
  }
}
