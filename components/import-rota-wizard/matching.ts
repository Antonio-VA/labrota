import type { DbStaff, DbShift, StaffMatch, ShiftMatch } from "./types"

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
}

export function matchStaff(fileName: string, staffList: DbStaff[]): StaffMatch {
  const target = norm(fileName)

  for (const s of staffList) {
    if (norm(`${s.first_name} ${s.last_name}`) === target) {
      return { file_name: fileName, staff_id: s.id, staff_label: `${s.first_name} ${s.last_name}`, confidence: "exact" }
    }
  }

  for (const s of staffList) {
    const firstInit = `${norm(s.first_name)} ${norm(s.last_name)[0]}`
    if (target === firstInit || target === `${firstInit}.`) {
      return { file_name: fileName, staff_id: s.id, staff_label: `${s.first_name} ${s.last_name}`, confidence: "fuzzy" }
    }
  }

  const byFirst = staffList.filter((s) => norm(s.first_name) === target.split(" ")[0])
  if (byFirst.length === 1) {
    return { file_name: fileName, staff_id: byFirst[0].id, staff_label: `${byFirst[0].first_name} ${byFirst[0].last_name}`, confidence: "fuzzy" }
  }

  return { file_name: fileName, staff_id: "", staff_label: "", confidence: "none" }
}

export function matchShift(fileCode: string, shiftList: DbShift[]): ShiftMatch {
  const target = norm(fileCode)
  for (const s of shiftList) {
    if (norm(s.code) === target) {
      return { file_code: fileCode, db_code: s.code, db_label: `${s.code} - ${s.name_es}`, confidence: "exact" }
    }
  }
  for (const s of shiftList) {
    if (norm(s.name_es) === target) {
      return { file_code: fileCode, db_code: s.code, db_label: `${s.code} - ${s.name_es}`, confidence: "name" }
    }
  }
  return { file_code: fileCode, db_code: "", db_label: "", confidence: "none" }
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d)
}

export function fmtWeekRange(weekStart: string): string {
  const start = new Date(weekStart + "T12:00:00")
  const end = new Date(weekStart + "T12:00:00")
  end.setDate(start.getDate() + 6)
  const s = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(start)
  const e = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(end)
  return `${s} – ${e}`
}
