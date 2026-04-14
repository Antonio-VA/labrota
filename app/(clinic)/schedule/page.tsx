import { ScheduleClient } from "@/app/(clinic)/schedule-client"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { getRotaWeek } from "@/app/(clinic)/rota/actions"

// Allow up to 5 minutes for hybrid (Claude) generation server actions
export const maxDuration = 300

// Fetch current week on the server so the grid renders with data on first load.
// loading.tsx provides the skeleton while this awaits — no client-side waterfall.
export default async function SchedulePage() {
  const weekStart = getMondayOfWeek(new Date())
  const initialData = await getRotaWeek(weekStart)
  return <ScheduleClient initialData={initialData} />
}
