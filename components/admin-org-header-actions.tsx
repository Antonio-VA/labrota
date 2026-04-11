"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { deleteOrganisation, toggleOrgStatus, copyOrganisation } from "@/app/admin/actions"
import { MoreHorizontal, Trash2, Copy, Power, PowerOff } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Org { id: string; name: string; slug: string; is_active: boolean; logo_url: string | null }

export function AdminOrgHeaderActions({ org, hrActive, activeModule = "labrota" }: { org: Org; hrActive?: boolean; activeModule?: "labrota" | "rrhh" }) {
  const router = useRouter()
  const [isNavigating, startNavigation] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isSuspending, startSuspend] = useTransition()

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function h(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [menuOpen])

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmSlug, setConfirmSlug] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [isDeleting, startDelete] = useTransition()

  // Copy modal
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyName, setCopyName] = useState(`${org.name} (copia)`)
  const [copyOpts, setCopyOpts] = useState({ departments: true, shifts: true, tasks: true, rules: true, config: true, staff: false, users: false, rotas: false })
  const [isCopying, startCopy] = useTransition()

  return (
    <>
      {isNavigating && (
        <div className="fixed inset-0 z-50 bg-background/60 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        {/* Name + badge + module switcher */}
        <div className="flex items-center gap-2">
          <h1 className="text-[18px] font-medium">{org.name}</h1>
          <Badge variant={org.is_active ? "active" : "inactive"}>
            {org.is_active ? "Activa" : "Suspendida"}
          </Badge>
          {hrActive && (
            <select
              value={activeModule}
              onChange={(e) => {
                const target = e.target.value
                startNavigation(() => {
                  if (target === "labrota") router.push(`/orgs/${org.id}`)
                  else if (target === "rrhh") router.push(`/orgs/${org.id}/rrhh`)
                })
              }}
              className="border border-border rounded-md px-2 py-1 text-[13px] bg-background font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 ml-1"
            >
              <option value="labrota">LabRota</option>
              <option value="rrhh">RRHH</option>
            </select>
          )}
        </div>

        {/* Three-dot menu — all actions */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center size-8 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <MoreHorizontal className="size-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-9 z-50 w-52 rounded-lg border border-border bg-background shadow-lg py-1">
              <button
                onClick={() => { setMenuOpen(false); setCopyOpen(true) }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-accent transition-colors"
              >
                <Copy className="size-4" />
                Copiar organización
              </button>
              <div className="h-px bg-border mx-2 my-1" />
              <button
                onClick={() => {
                  setMenuOpen(false)
                  startSuspend(async () => {
                    await toggleOrgStatus(org.id, org.is_active)
                  })
                }}
                disabled={isSuspending}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-accent transition-colors disabled:opacity-50"
              >
                {org.is_active ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                {org.is_active ? "Suspender" : "Activar"}
              </button>
              <button
                onClick={() => { setMenuOpen(false); setConfirmSlug(""); setDeleteError(""); setDeleteOpen(true) }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[14px] text-destructive hover:bg-accent transition-colors"
              >
                <Trash2 className="size-4" />
                Eliminar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Copy modal ────────────────────────────────────────────────────── */}
      {copyOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => !isCopying && setCopyOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[440px] p-5 flex flex-col gap-4">
            <div>
              <p className="text-[15px] font-medium">Copiar organización</p>
              <p className="text-[13px] text-muted-foreground mt-1">Crea una nueva organización con la configuración de {org.name}.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium">Nombre</label>
              <Input value={copyName} onChange={(e) => setCopyName(e.target.value)} disabled={isCopying} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium">Datos a copiar</label>
              {([
                { key: "config", label: "Configuración laboratorio", default: true },
                { key: "departments", label: "Departamentos", default: true },
                { key: "shifts", label: "Turnos", default: true },
                { key: "tasks", label: "Tareas", default: true },
                { key: "rules", label: "Reglas", default: true },
                { key: "staff", label: "Personal", default: false },
                { key: "users", label: "Usuarios", default: false },
                { key: "rotas", label: "Horarios", default: false },
              ] as { key: keyof typeof copyOpts; label: string; default: boolean }[]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyOpts[key]}
                    onChange={(e) => setCopyOpts((p) => ({ ...p, [key]: e.target.checked }))}
                    disabled={isCopying || (key === "rotas" && !copyOpts.staff)}
                    className="size-4 rounded accent-primary"
                  />
                  {label}
                  {(key === "staff" || key === "users") && <span className="text-[11px] text-muted-foreground">(no recomendado)</span>}
                  {key === "rotas" && <span className="text-[11px] text-muted-foreground">(requiere personal)</span>}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setCopyOpen(false)} disabled={isCopying}>Cancelar</Button>
              <Button size="sm" disabled={!copyName.trim() || isCopying} onClick={() => {
                startCopy(async () => {
                  const result = await copyOrganisation(org.id, copyName.trim(), copyOpts)
                  if (result.error) { toast.error(result.error); return }
                  toast.success("Organización copiada")
                  setCopyOpen(false)
                  if (result.orgId) router.push(`/admin/orgs/${result.orgId}`)
                })
              }}>
                {isCopying ? "Copiando…" : "Copiar"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Delete modal ──────────────────────────────────────────────────── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !isDeleting && setDeleteOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="size-4 text-destructive" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-destructive">Eliminar organización</h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-[14px] leading-relaxed">
              Se eliminarán permanentemente todos los datos de <strong>{org.name}</strong>.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground">
                Escribe <span className="font-mono font-medium text-foreground">{org.slug}</span> para confirmar
              </label>
              <Input value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} placeholder={org.slug} disabled={isDeleting} className="font-mono" />
            </div>
            {deleteError && <p className="text-[13px] text-destructive">{deleteError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={() => {
                startDelete(async () => {
                  const result = await deleteOrganisation(org.id)
                  if (result?.error) setDeleteError(result.error)
                  else router.push("/")
                })
              }} disabled={confirmSlug !== org.slug || isDeleting}>
                {isDeleting ? "Eliminando…" : "Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
