"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { Tecnica } from "@/lib/types/database"
import { TECNICA_PILL, DEPT_FOR_ROLE } from "./constants"

export function AssignmentPopover({
  assignment, staffSkills, tecnicas, departments = [],
  onFunctionSave, onTecnicaSave, isPublished, enableTaskInShift = true, children,
}: {
  assignment: { id: string; staff: { role: string }; function_label: string | null; tecnica_id: string | null }
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  departments?: import("@/lib/types/database").Department[]
  onFunctionSave: (id: string, label: string | null) => void
  onTecnicaSave: (id: string, tecnicaId: string | null) => void
  isPublished: boolean
  enableTaskInShift?: boolean
  children: React.ReactNode
}) {
  const tSheet = useTranslations("assignmentSheet")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const staffSkillCodes = new Set(staffSkills.map((s) => s.skill))
  const staffDept = DEPT_FOR_ROLE[assignment.staff.role]
  const currentLabel = assignment.function_label ?? null

  const availableTecnicas = tecnicas.filter((t) =>
    t.activa && t.department.split(",").includes(staffDept) && staffSkillCodes.has(t.codigo)
  )

  const roleDept = departments.find((d) => d.parent_id == null && d.code === assignment.staff.role)
  const roleSubDepts = roleDept ? departments.filter((d) => d.parent_id === roleDept.id) : []

  if (!enableTaskInShift || isPublished) return <>{children}</>
  const visibleTecnicas = availableTecnicas
  if (visibleTecnicas.length === 0 && roleSubDepts.length === 0) return <>{children}</>

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className="cursor-pointer flex-1 min-w-0">
        {children}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1.5 w-52">
          <p className="text-[11px] font-semibold px-2.5 mb-1">{tSheet("assignment")}</p>
          {roleSubDepts.length > 0 && (
            <>
              <p className="text-[10px] text-muted-foreground font-medium mb-1 px-2.5">{tSheet("departmentLabel")}</p>
              <div className="flex flex-col">
                {roleSubDepts.map((dept) => {
                  const isActive = currentLabel === dept.code
                  return (
                    <button
                      key={dept.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onFunctionSave(assignment.id, isActive ? null : dept.code)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-muted"
                      )}
                    >
                      <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: dept.colour }} />
                      <span className={cn("text-[12px] truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{dept.name}</span>
                      {isActive && <span className="ml-auto text-[10px] text-primary">✓</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {visibleTecnicas.length > 0 && (
            <>
              <div className="h-px bg-border mx-2 my-1" />
              <p className="text-[10px] text-muted-foreground font-medium mb-1 px-2.5">{tSheet("tasksLabel")}</p>
              <div className="flex flex-col">
                {visibleTecnicas.map((tec) => {
                  const isActive = assignment.tecnica_id === tec.id
                  const color = TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue
                  return (
                    <button
                      key={tec.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onTecnicaSave(assignment.id, isActive ? null : tec.id)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-muted"
                      )}
                    >
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", color, isActive && "ring-1 ring-offset-1 ring-current")}>
                        {tec.codigo}
                      </span>
                      <span className={cn("text-[12px] truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{tec.nombre_es}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
