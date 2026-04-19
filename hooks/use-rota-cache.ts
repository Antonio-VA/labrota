import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"

export interface RotaCache {
  weeks: Map<string, RotaWeekData>
  staff: StaffWithSkills[] | null
}

// Pin cache to window so it survives Next.js HMR module re-evaluation in dev.
// In production a module-level Map would also work; window makes both envs reliable.
export function getRotaCache(): RotaCache {
  if (typeof window === "undefined") return { weeks: new Map(), staff: null }
  const win = window as unknown as { __lrCache?: RotaCache }
  if (!win.__lrCache) win.__lrCache = { weeks: new Map(), staff: null }
  return win.__lrCache
}
