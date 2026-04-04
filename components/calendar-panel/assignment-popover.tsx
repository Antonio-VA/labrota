"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Hourglass } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { Tecnica } from "@/lib/types/database"
import { TECNICA_PILL } from "./constants"

// Maps department to role for técnica filtering
export const DEPT_FOR_ROLE: Record<string, string> = { lab: "lab", andrology: "andrology" }

// ── Assignment popover (función + técnica in one) ─────────────────────────────

export function AssignmentPopover({ assignment, staffSkills, tecnicas, departments = [], onFunctionSave, isPublished, disabled, children }: {
  assignment: { id: string; staff: { role: string }; function_label: string | null }
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  departments?: import("@/lib/types/database").Department[]
  onFunctionSave: (id: string, label: string | null) => void
  isPublished: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  // When disabled, just render children without any popover
  if (disabled) return <>{children}</>

  const t = useTranslations("schedule")
  const tStaff = useTranslations("staff")
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean }>({ top: 0, left: 0, flipUp: false })

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (popupRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Calculate position when opening
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popupHeight = 200 // approximate
    const spaceBelow = window.innerHeight - rect.bottom
    const flipUp = spaceBelow < popupHeight && rect.top > popupHeight
    setPos({
      top: flipUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      flipUp,
    })
  }, [open])

  const currentLabel = assignment.function_label ?? null
  const staffSkillCodes = new Set(staffSkills.map((s) => s.skill))
  const staffDept = DEPT_FOR_ROLE[assignment.staff.role]

  const availableTecnicas = tecnicas.filter((t) =>
    t.activa && t.department.split(",").includes(staffDept) && staffSkillCodes.has(t.codigo)
  )

  // Sub-departments for the staff member's role department
  const roleDept = departments.find((d) => d.parent_id == null && d.code === assignment.staff.role)
  const roleSubDepts = roleDept ? departments.filter((d) => d.parent_id === roleDept.id) : []

  if ((availableTecnicas.length === 0 && roleSubDepts.length === 0) || isPublished) return <>{children}</>

  return (
    <div ref={triggerRef}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className="cursor-pointer">
        {children}
      </div>
      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[100] bg-background border border-border rounded-lg shadow-xl py-1.5 w-52"
          style={{
            left: pos.left,
            ...(pos.flipUp
              ? { bottom: window.innerHeight - pos.top }
              : { top: pos.top }),
          }}
        >
          <p className="text-[11px] font-semibold px-2.5 mb-1">{t("editAssignment")}</p>
          {/* Sub-departments for staff's role */}
          {roleSubDepts.length > 0 && (
            <>
              <p className="text-[10px] text-muted-foreground font-medium mb-1 px-2.5">{tStaff("fields.role")}</p>
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
          {/* Tareas section — techniques the staff member is qualified for */}
          {availableTecnicas.length > 0 && (
            <>
              <div className="h-px bg-border mx-2 my-1" />
              <p className="text-[10px] text-muted-foreground font-medium mb-1 px-2.5">{t("tasks")}</p>
              <div className="flex flex-col">
                {availableTecnicas.map((tec) => {
                  const isActive = currentLabel === tec.codigo
                  const isTraining = staffSkills.find((s) => s.skill === tec.codigo)?.level === "training"
                  const pillColor = TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue
                  return (
                    <button
                      key={tec.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onFunctionSave(assignment.id, isActive ? null : tec.codigo)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-muted"
                      )}
                    >
                      <span className={cn(
                        "text-[10px] font-semibold py-0.5 rounded border shrink-0 w-9 text-center inline-flex items-center justify-center",
                        pillColor,
                        isActive && "ring-1 ring-offset-1 ring-current"
                      )}>
                        {isTraining && <Hourglass className="size-2 text-amber-500 inline mr-0.5" />}
                        {tec.codigo}
                      </span>
                      <span className={cn("text-[12px] truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{tec.nombre_es}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
