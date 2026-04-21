import type { StaffWithSkills } from "@/lib/types/database"

/**
 * Shared filter/sort pipeline for the "pick a staff member" popovers used
 * by task-grid/staff-selector and transposed-task-grid. Both previously
 * duplicated this logic with subtle differences; keeping it here makes the
 * two pickers agree on what "qualified" and "matches search" mean.
 *
 *   qualified  = has a staff_skill whose code matches the tecnica (case-
 *                insensitive); optionally filters out inactive staff.
 *   matched    = name or initials contain the search string (case-
 *                insensitive). Empty search keeps everyone.
 *   sorted     = first name, then last name, using localeCompare.
 */

export interface FilterOptions {
  /** Tecnica code to require (e.g. "ICSI"). Compared case-insensitively. */
  tecnicaCode: string
  /** Optional search — matched against full name AND first+last initials. */
  search?: string
  /** When true (default), skip staff whose onboarding_status is "inactive". */
  excludeInactive?: boolean
  /** When true, also require `skill.level === "certified"`. */
  certifiedOnly?: boolean
}

export function filterStaffForPicker(
  staff: StaffWithSkills[],
  opts: FilterOptions,
): StaffWithSkills[] {
  const tecCode = opts.tecnicaCode.toUpperCase()
  const excludeInactive = opts.excludeInactive ?? true
  const q = opts.search?.trim().toLowerCase() ?? ""

  const qualified = staff.filter((s) => {
    if (excludeInactive && s.onboarding_status === "inactive") return false
    return s.staff_skills?.some((sk) =>
      sk.skill.toUpperCase() === tecCode &&
      (!opts.certifiedOnly || sk.level === "certified")
    )
  })

  const matched = q
    ? qualified.filter((s) => {
        const name = `${s.first_name} ${s.last_name}`.toLowerCase()
        const initials = `${s.first_name[0] ?? ""}${s.last_name[0] ?? ""}`.toLowerCase()
        return name.includes(q) || initials.includes(q)
      })
    : qualified

  return matched.sort(
    (a, b) =>
      a.first_name.localeCompare(b.first_name) ||
      a.last_name.localeCompare(b.last_name),
  )
}
