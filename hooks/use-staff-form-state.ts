"use client"

import { useMemo, useState, useTransition } from "react"
import type { StaffWithSkills, SkillName, WorkingDay, Tecnica } from "@/lib/types/database"
import { STAFF_PASTEL_COLORS, DEPT_MAP, ALL_DAYS } from "@/components/staff-form/constants"

export type SkillState = "off" | "training" | "certified"

type SetList<T> = (updater: (prev: T[]) => T[]) => void

function cyclePrefAvoid<T>(item: T, pref: T[], avoid: T[], setPref: SetList<T>, setAvoid: SetList<T>) {
  const isPref = pref.includes(item)
  const isAvoid = avoid.includes(item)
  if (!isPref && !isAvoid) setPref((p) => [...p, item])
  else if (isPref) {
    setPref((p) => p.filter((v) => v !== item))
    setAvoid((p) => [...p, item])
  } else setAvoid((p) => p.filter((v) => v !== item))
}

export function useStaffFormState({ staff, tecnicas }: {
  staff?: StaffWithSkills
  tecnicas?: Tecnica[]
}) {
  const [selectedDays, setSelectedDays] = useState<WorkingDay[]>(staff?.working_pattern ?? ALL_DAYS)
  const [preferredDays, setPreferredDays] = useState<WorkingDay[]>(staff?.preferred_days ?? [])
  const [avoidDays, setAvoidDays] = useState<WorkingDay[]>(staff?.avoid_days ?? [])
  const [preferredShifts, setPreferredShifts] = useState<string[]>(
    staff?.preferred_shift ? staff.preferred_shift.split(",").filter(Boolean) : []
  )
  const [avoidShifts, setAvoidShifts] = useState<string[]>(staff?.avoid_shifts ?? [])
  const [role, setRole] = useState<string>(staff?.role ?? "lab")
  const [contractType, setContractType] = useState<string>(staff?.contract_type ?? "full_time")
  const [selectedColor, setSelectedColor] = useState<string>(
    () => staff?.color || STAFF_PASTEL_COLORS[Math.floor(Math.random() * STAFF_PASTEL_COLORS.length)]
  )

  const capacidades = useMemo<{ skill: string; label: string }[]>(() => {
    const dept = DEPT_MAP[role]
    if (!dept || !tecnicas) return []
    return tecnicas
      .filter((t) => t.activa && t.department.split(",").includes(dept))
      .sort((a, b) => a.orden - b.orden)
      .map((t) => ({ skill: t.codigo, label: t.nombre_es }))
  }, [role, tecnicas])

  const [skillLevels, setSkillLevels] = useState<Record<SkillName, SkillState>>(() => {
    const map = {} as Record<SkillName, SkillState>
    for (const sk of staff?.staff_skills ?? []) {
      map[sk.skill] = sk.level as SkillState
    }
    return map
  })

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, startDelete] = useTransition()

  const toggleDay = (day: WorkingDay) => {
    setSelectedDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
      setPreferredDays((pref) => pref.filter((d) => next.includes(d)))
      return next
    })
  }

  const cycleDayPreference = (day: WorkingDay) => {
    if (!selectedDays.includes(day)) return
    cyclePrefAvoid(day, preferredDays, avoidDays, setPreferredDays, setAvoidDays)
  }

  const cycleShiftPreference = (code: string) =>
    cyclePrefAvoid(code, preferredShifts, avoidShifts, setPreferredShifts, setAvoidShifts)

  const cycleSkill = (skill: SkillName) => {
    setSkillLevels((prev) => {
      const cur = prev[skill] ?? "off"
      const next: SkillState = cur === "off" ? "training" : cur === "training" ? "certified" : "off"
      return { ...prev, [skill]: next }
    })
  }

  return {
    selectedDays, toggleDay,
    preferredDays, avoidDays, cycleDayPreference,
    preferredShifts, avoidShifts, cycleShiftPreference,
    role, setRole,
    contractType, setContractType,
    selectedColor, setSelectedColor,
    capacidades, skillLevels, cycleSkill,
    confirmDelete, setConfirmDelete,
    isDeleting, startDelete,
  }
}

export type StaffFormState = ReturnType<typeof useStaffFormState>
