import { ScheduleClient } from "@/app/(clinic)/schedule-client"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { getRotaWeek } from "@/app/(clinic)/rota/actions"
import { getWeekNotes } from "@/app/(clinic)/notes-actions"

// Allow up to 5 minutes for hybrid (Claude) generation server actions
export const maxDuration = 300

// Prefetch the current week + notes on the server so the grid renders with
// data on first load. next.config.ts sets experimental.staleTimes so the
// router cache keeps this RSC payload fresh across short detours, which
// preserves the "instant revisit" behaviour without a DB round-trip.
export default async function SchedulePage() {
  const weekStart = getMondayOfWeek(new Date())
  const [initialData, initialNotes] = await Promise.all([
    getRotaWeek(weekStart).catch(() => undefined),
    getWeekNotes(weekStart).catch(() => undefined),
  ])
  return (
    <ScheduleClient
      initialData={initialData}
      initialStaff={initialData?.activeStaff}
      initialNotes={initialNotes}
    />
  )
}
