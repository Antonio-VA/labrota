import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { createWindowCache } from "@/lib/window-cache"

export interface RotaCache {
  weeks: Map<string, RotaWeekData>
  staff: StaffWithSkills[] | null
}

export function getRotaCache(): RotaCache {
  return createWindowCache<RotaCache>("__lrCache", () => ({ weeks: new Map(), staff: null }))
}
