/**
 * Default department border colours.
 * Used as fallback when departments haven't loaded from DB yet.
 * Dynamic colours from the departments table override these at runtime.
 */
export const DEFAULT_DEPT_BORDER: Record<string, string> = {
  lab:       "#60A5FA",
  andrology: "#34D399",
  admin:     "#94A3B8",
}

export const DEFAULT_DEPT_LABEL: Record<string, string> = {
  lab:       "Embriología",
  andrology: "Andrología",
  admin:     "Administración",
}

export const DEFAULT_DEPT_ORDER: Record<string, number> = {
  lab: 0,
  andrology: 1,
  admin: 2,
}
