"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Trash2, RotateCcw, X, AlertTriangle, Archive } from "lucide-react"
import { useLocale } from "next-intl"
import { formatDate } from "@/lib/format-date"
import { toast } from "sonner"
import {
  getBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  type BackupEntry,
} from "@/app/admin/backup-actions"

export function AdminBackups({ orgId }: { orgId: string }) {
  const locale = useLocale() as "es" | "en"
  const router = useRouter()
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [createLabel, setCreateLabel] = useState("")
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)
  const [restoreOpts, setRestoreOpts] = useState({ config: true, rotas: true, includeDrafts: false })
  const [deleteTarget, setDeleteTarget] = useState<BackupEntry | null>(null)

  useEffect(() => {
    setLoading(true)
    getBackups(orgId).then((data) => { setBackups(data); setLoading(false) })
  }, [orgId])

  const manualBackups = backups.filter((b) => b.type === "manual")
  const autoBackups = backups.filter((b) => b.type === "auto")

  function fmt(iso: string) {
    const d = new Date(iso)
    return formatDate(d, locale) + " · " +
      d.toLocaleTimeString(locale === "es" ? "es-ES" : "en-US", { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-medium">Copias de seguridad</h2>
        <Button size="sm" onClick={() => { setCreateLabel(""); setCreateOpen(true) }}>
          <Plus className="size-3.5" />
          Crear copia manual
        </Button>
      </div>

      {loading ? (
        <div className="text-[13px] text-muted-foreground py-8 text-center">Cargando copias…</div>
      ) : backups.length === 0 ? (
        <div className="text-[13px] text-muted-foreground py-8 text-center italic">
          No hay copias de seguridad. Crea una manualmente o espera a que el sistema genere una automática.
        </div>
      ) : (
        <>
          {/* Manual backups */}
          {manualBackups.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Manuales</p>
              <div className="rounded-lg border border-border bg-background overflow-hidden divide-y divide-border">
                {manualBackups.map((b) => (
                  <BackupRow key={b.id} backup={b} fmt={fmt} onRestore={() => setRestoreTarget(b)} onDelete={() => setDeleteTarget(b)} />
                ))}
              </div>
            </div>
          )}

          {/* Auto backups */}
          {autoBackups.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Automáticas</p>
              <div className="rounded-lg border border-border bg-background overflow-hidden divide-y divide-border">
                {autoBackups.map((b) => (
                  <BackupRow key={b.id} backup={b} fmt={fmt} onRestore={() => setRestoreTarget(b)} onDelete={() => setDeleteTarget(b)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create manual backup modal */}
      {createOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setCreateOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[400px] p-5 flex flex-col gap-4">
            <p className="text-[15px] font-medium">Crear copia de seguridad</p>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium">Etiqueta</label>
              <Input value={createLabel} onChange={(e) => setCreateLabel(e.target.value)} placeholder="Pre-migración, pre-cambio de turnos..." disabled={isPending} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button size="sm" disabled={isPending} onClick={() => {
                startTransition(async () => {
                  const result = await createBackup(orgId, "manual", createLabel.trim() || "Copia manual")
                  if (result.error) { toast.error(result.error); return }
                  toast.success("Copia creada")
                  setCreateOpen(false)
                  const updated = await getBackups(orgId)
                  setBackups(updated)
                })
              }}>
                {isPending ? "Creando…" : "Crear"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Restore modal */}
      {restoreTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setRestoreTarget(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[440px] p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] font-medium">¿Restaurar esta copia?</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Se sobreescribirá la configuración actual. Los datos posteriores a {fmt(restoreTarget.created_at)} se perderán.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={restoreOpts.config} onChange={(e) => setRestoreOpts((p) => ({ ...p, config: e.target.checked }))} className="size-4 rounded accent-primary" />
                Restaurar configuración
              </label>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={restoreOpts.rotas} onChange={(e) => setRestoreOpts((p) => ({ ...p, rotas: e.target.checked }))} className="size-4 rounded accent-primary" />
                Restaurar rotas <span className="text-muted-foreground">({restoreTarget.rota_summary})</span>
              </label>
              {restoreOpts.rotas && (
                <label className="flex items-center gap-2 text-[13px] cursor-pointer ml-6">
                  <input type="checkbox" checked={restoreOpts.includeDrafts} onChange={(e) => setRestoreOpts((p) => ({ ...p, includeDrafts: e.target.checked }))} className="size-4 rounded accent-primary" />
                  Incluir borradores
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRestoreTarget(null)}>Cancelar</Button>
              <Button size="sm" disabled={isPending || (!restoreOpts.config && !restoreOpts.rotas)} onClick={() => {
                startTransition(async () => {
                  const result = await restoreBackup(restoreTarget.id, orgId, restoreOpts)
                  if (result.error) { toast.error(result.error); return }
                  toast.success("Copia restaurada")
                  setRestoreTarget(null)
                  router.refresh()
                })
              }}>
                {isPending ? "Restaurando…" : "Restaurar"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setDeleteTarget(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[380px] p-5 flex flex-col gap-4">
            <p className="text-[15px] font-medium">¿Eliminar esta copia?</p>
            <p className="text-[13px] text-muted-foreground">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" disabled={isPending} onClick={() => {
                startTransition(async () => {
                  const result = await deleteBackup(deleteTarget.id, orgId)
                  if (result.error) { toast.error(result.error); return }
                  toast.success("Copia eliminada")
                  setDeleteTarget(null)
                  setBackups((prev) => prev.filter((b) => b.id !== deleteTarget.id))
                })
              }}>
                {isPending ? "Eliminando…" : "Eliminar"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BackupRow({ backup, fmt, onRestore, onDelete }: {
  backup: BackupEntry; fmt: (iso: string) => string; onRestore: () => void; onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Archive className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium truncate">
            {backup.label ?? `Auto · ${fmt(backup.created_at)}`}
          </p>
          <span className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0",
            backup.type === "manual" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"
          )}>
            {backup.type === "manual" ? "Manual" : "Auto"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {fmt(backup.created_at)}
          {backup.created_by_name && ` · ${backup.created_by_name}`}
          {" · "}
          {backup.config_summary}
        </p>
        <p className="text-[11px] text-muted-foreground/60">{backup.rota_summary}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onRestore} className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Restaurar">
          <RotateCcw className="size-3.5" />
        </button>
        <button onClick={onDelete} className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Eliminar">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
