"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Archive, Pause, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createBackup } from "@/app/admin/backup-actions"
import { toggleOrgStatus, deleteOrganisation } from "@/app/admin/actions"
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

  function toggleOne(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
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
      setSelected(new Set())
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
      setSelected(new Set())
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
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <>
      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-primary/20 bg-primary/5">
          <span className="text-[13px] font-medium">{selected.size} seleccionada{selected.size !== 1 ? "s" : ""}</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={handleBulkBackup} disabled={isPending} className="gap-1.5">
            <Archive className="size-3.5" />
            Backup
          </Button>
          <Button size="sm" variant="outline" onClick={handleBulkSuspend} disabled={isPending} className="gap-1.5">
            <Pause className="size-3.5" />
            Suspender
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={isPending} className="gap-1.5">
            <Trash2 className="size-3.5" />
            Eliminar
          </Button>
          <button onClick={() => setSelected(new Set())} className="text-[12px] text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
        </div>
      )}

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
            {rows.map((row, i) => (
              <tr key={row.id} className={cn("border-b border-border last:border-0 hover:bg-muted/50", i % 2 === 1 && "bg-muted/30", selected.has(row.id) && "bg-primary/5")}>
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
    </>
  )
}
