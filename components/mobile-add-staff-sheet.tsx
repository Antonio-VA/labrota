"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Search } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { upsertAssignment } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftTypeDefinition } from "@/lib/types/database"

interface MobileAddStaffSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  departmentCode: string
  departmentName: string
  date: string
  weekStart: string
  staffList: StaffWithSkills[]
  assignedStaffIds: Set<string>
  onLeaveStaffIds: Set<string>
  shiftTypes: ShiftTypeDefinition[]
  weeklyAssignmentCounts: Record<string, number>
  onAdded: () => void
}

export function MobileAddStaffSheet({
  open, onOpenChange, departmentCode, departmentName,
  date, weekStart, staffList, assignedStaffIds, onLeaveStaffIds,
  shiftTypes, weeklyAssignmentCounts, onAdded,
}: MobileAddStaffSheetProps) {
  const t = useTranslations("mobileAddStaff")
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()

  // Filter staff by department (role) and not already assigned
  const available = staffList.filter((s) => {
    if (s.role !== departmentCode) return false
    if (assignedStaffIds.has(s.id)) return false
    if (onLeaveStaffIds.has(s.id)) return false
    return true
  }).filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
  })

  const defaultShift = shiftTypes[0]?.code ?? "T1"

  function handleAdd(staffId: string) {
    const staff = staffList.find((s) => s.id === staffId)
    const shift = staff?.preferred_shift ?? defaultShift
    startTransition(async () => {
      // Close immediately for instant feel
      onOpenChange(false)
      const result = await upsertAssignment({ weekStart, staffId, date, shiftType: shift })
      if (result.error) {
        toast.error(result.error)
      } else {
        // Small delay to let pending server ops settle
        await new Promise((r) => setTimeout(r, 300))
        onAdded()
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl max-h-[75dvh] p-0 flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center py-2 shrink-0">
          <div className="w-8 h-1 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="px-4 pb-2 shrink-0">
          <p className="text-[14px] font-medium">{t("addStaff")} — {departmentName}</p>
        </div>
        {/* Search */}
        <div className="px-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-8 h-8 text-[13px]"
            />
          </div>
        </div>
        {/* Staff list */}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,8px)]">
          {available.length === 0 ? (
            <p className="text-[13px] text-muted-foreground italic text-center py-8">
              {t("noStaffAvailable")}
            </p>
          ) : available.map((s) => {
            const weekCount = weeklyAssignmentCounts[s.id] ?? 0
            const atLimit = weekCount >= s.days_per_week
            return (
              <button
                key={s.id}
                onClick={() => handleAdd(s.id)}
                disabled={isPending || atLimit}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-3 text-left transition-colors active:bg-accent",
                  atLimit && "opacity-50"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium">{s.first_name} {s.last_name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {s.preferred_shift && <span>{t("shiftLabel")}: {s.preferred_shift}</span>}
                    <span>{weekCount}/{s.days_per_week} {t("shifts")}</span>
                    {atLimit && <span className="text-amber-500 font-medium">{t("limit")}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
