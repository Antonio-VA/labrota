"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Archive, Pause, Trash2, Copy, X } from "lucide-react"
import { toast } from "sonner"
import { createBackup } from "@/app/admin/backup-actions"
import { toggleOrgStatus, deleteOrganisation, copyOrganisation } from "@/app/admin/actions"
import { useRouter } from "next/navigation"
import { formatDateWithYear } from "@/lib/format-date"

interface OrgRow {
  id: string
  name: string
  slug: string
  is_active: boolean
  logo_url: string | null
  created_at: string
  activeStaff: number
  totalRotas: number
  recentRotas: number
  lastLogin: string | null
}

export function AdminOrgTable({ rows, locale }: { rows: OrgRow[]; locale: string }) {
  const router = useRouter()
  const formatDate = (d: string) => formatDateWithYear(d, locale as "es" | "en")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someSelected = rows.some((r) => selected.has(r.id))
  const count = selected.size

  function toggleOne(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }
  function clearSelection() {
    setSelected(new Set())
  }

  function handleBulkBackup() {
    const ids = [...selected]
    startTransition(async () => {
      let ok = 0
      for (const id of ids) {
        const result = await createBackup(id, "manual", "Copia masiva")
        if (!result.error) ok++
      }
      toast.success(`${ok} copia${ok !== 1 ? "s" : ""} creada${ok !== 1 ? "s" : ""}`)
      clearSelection()
    })
  }

  function handleBulkCopy() {
    const ids = [...selected]
    const selectedRows = rows.filter((r) => ids.includes(r.id))
    if (!confirm(`¿Copiar ${ids.length} organización${ids.length !== 1 ? "es" : ""}?`)) return
    startTransition(async () => {
      let ok = 0
      for (const row of selectedRows) {
        const result = await copyOrganisation(row.id, `Copia de ${row.name}`, {
          departments: true, shifts: true, tasks: true, rules: true, staff: true, config: true,
        })
        if (!result.error) ok++
      }
      toast.success(`${ok} organización${ok !== 1 ? "es" : ""} copiada${ok !== 1 ? "s" : ""}`)
      clearSelection()
      router.refresh()
    })
  }

  function handleBulkSuspend() {
    const ids = [...selected]
    const activeIds = ids.filter((id) => rows.find((r) => r.id === id)?.is_active)
    if (activeIds.length === 0) { toast.info("No hay organizaciones activas seleccionadas"); return }
    if (!confirm(`¿Suspender ${activeIds.length} organización${activeIds.length !== 1 ? "es" : ""}?`)) return
    startTransition(async () => {
      let ok = 0
      for (const id of activeIds) {
        await toggleOrgStatus(id, true)
        ok++
      }
      toast.success(`${ok} organización${ok !== 1 ? "es" : ""} suspendida${ok !== 1 ? "s" : ""}`)
      clearSelection()
      router.refresh()
    })
  }

  function handleBulkDelete() {
    const ids = [...selected]
    if (!confirm(`¿Eliminar ${ids.length} organización${ids.length !== 1 ? "es" : ""} permanentemente? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      let ok = 0
      for (const id of ids) {
        await deleteOrganisation(id)
        ok++
      }
      toast.success(`${ok} organización${ok !== 1 ? "es" : ""} eliminada${ok !== 1 ? "s" : ""}`)
      clearSelection()
      router.refresh()
    })
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                  onChange={toggleAll}
                  className="size-4 rounded accent-primary cursor-pointer"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Organisation</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Staff</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rotas</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">30d</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last login</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={cn("border-b border-border last:border-0 hover:bg-muted/50", selected.has(row.id) && "bg-primary/5")}>
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                    className="size-4 rounded accent-primary cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 shrink-0 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden text-[11px] font-semibold text-muted-foreground">
                      {row.logo_url ? (
                        <img src={row.logo_url} alt={row.name} className="size-full object-contain p-0.5" />
                      ) : (
                        row.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
                      )}
                    </div>
                    <div>
                      <Link href={`/admin/orgs/${row.id}`} className="font-medium text-primary hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-muted-foreground text-[13px]">{row.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={row.is_active ? "active" : "inactive"}>
                    {row.is_active ? "Active" : "Suspended"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{row.activeStaff}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.totalRotas}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.recentRotas}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.lastLogin ? formatDate(row.lastLogin) : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(row.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Floating bulk action bar — matches staff page pattern */}
      {someSelected && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 h-11 rounded-[10px] border border-border bg-background"
          style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.10)" }}
        >
          {/* Count */}
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground shrink-0 whitespace-nowrap">
            <span className="inline-flex items-center justify-center size-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              {count}
            </span>
            {count !== 1 ? "seleccionadas" : "seleccionada"}
          </span>

          <div className="w-px h-5 bg-border shrink-0" />

          {/* Backup */}
          <button
            onClick={handleBulkBackup}
            disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Archive className="size-3 shrink-0" />
            Backup
          </button>

          {/* Copy */}
          <button
            onClick={handleBulkCopy}
            disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Copy className="size-3 shrink-0" />
            Copiar
          </button>

          {/* Suspend */}
          <button
            onClick={handleBulkSuspend}
            disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Pause className="size-3 shrink-0" />
            Suspender
          </button>

          <div className="w-px h-5 bg-border shrink-0" />

          {/* Delete */}
          <button
            onClick={handleBulkDelete}
            disabled={isPending}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-destructive/30 bg-destructive/5 text-destructive text-[12px] font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Trash2 className="size-3 shrink-0" />
            Eliminar
          </button>

          <div className="w-px h-5 bg-border shrink-0" />

          {/* Clear */}
          <button
            onClick={clearSelection}
            className="flex items-center gap-1 h-7 px-2 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
          >
            <X className="size-3 shrink-0" />
            Cancelar
          </button>
        </div>
      )}
    </>
  )
}
