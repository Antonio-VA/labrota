"use client"

import { useState, useRef, useEffect } from "react"
import { Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"

export function StaffSelector({
  open, onClose, onAdd, onRemoveStaff, onToggleWholeTeam: onWtToggle,
  tecnica, availableStaff, assignedStaffIds, leaveStaffIds, isWholeTeam, allowWholeTeam,
}: {
  open: boolean; onClose: () => void; onAdd: (staffId: string) => void
  onRemoveStaff: (staffId: string) => void; onToggleWholeTeam: () => void
  tecnica: Tecnica; availableStaff: StaffWithSkills[]
  assignedStaffIds: Set<string>; leaveStaffIds: Set<string>
  isWholeTeam: boolean; allowWholeTeam: boolean
}) {
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  if (!open) return null

  const tecCode = tecnica.codigo.toUpperCase()
  const qualifiedStaff = availableStaff.filter((s) =>
    s.staff_skills.some((sk) => sk.skill.toUpperCase() === tecCode)
  )

  const filtered = qualifiedStaff.filter((s) => {
    if (!search) return true
    const name = `${s.first_name} ${s.last_name}`.toLowerCase()
    const initials = `${s.first_name[0]}${s.last_name[0]}`.toLowerCase()
    return name.includes(search.toLowerCase()) || initials.includes(search.toLowerCase())
  }).sort((a, b) => a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name))

  const atCap = assignedStaffIds.size >= 3

  function toggle(id: string) {
    if (assignedStaffIds.has(id)) onRemoveStaff(id)
    else if (assignedStaffIds.size < 3) onAdd(id)
  }

  return (
    <div ref={ref} className="bg-background border border-border rounded-lg shadow-lg w-56 overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="p-2 border-b border-border">
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full text-[12px] px-2 py-1 border border-input rounded outline-none focus:border-primary bg-background" />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {allowWholeTeam && (
          <button onClick={() => onWtToggle()} className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors", isWholeTeam ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50")}>
            <Users className="size-3.5" /><span className="flex-1">Todo el equipo</span>{isWholeTeam && <span className="text-[10px]">✓</span>}
          </button>
        )}
        {allowWholeTeam && <div className="h-px bg-border" />}
        {filtered.length === 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">Sin personal cualificado</p>}
        {filtered.map((s) => {
          const isSelected = assignedStaffIds.has(s.id)
          const onLeave = leaveStaffIds.has(s.id)
          const disabled = (atCap && !isSelected) || onLeave
          return (
            <button key={s.id} onClick={() => { if (!disabled) toggle(s.id) }} disabled={disabled} className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors", disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/50")}>
              <span className={cn("size-4 rounded border flex items-center justify-center text-[9px] shrink-0 transition-colors", isSelected ? "bg-primary border-primary text-primary-foreground" : onLeave ? "border-red-300 bg-red-100" : "border-border bg-background")}>{(isSelected || onLeave) && "✓"}</span>
              <span className="text-[10px] font-semibold text-muted-foreground w-5 shrink-0">{`${s.first_name[0]}${s.last_name[0]}`}</span>
              <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
              {onLeave && <span className="text-[9px] text-red-500 shrink-0">Baja</span>}
              {isSelected && !onLeave && <span className="text-[9px] text-muted-foreground shrink-0">Asignado</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
