import { getRotaWeek, getActiveStaff } from "@/app/(clinic)/rota/actions"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { ScheduleClient } from "@/app/(clinic)/schedule-client"

export default async function SchedulePage() {
  const weekStart = getMondayOfWeek()

  // Fetch initial data on the server — eliminates client-side waterfall
  const [initialData, initialStaff] = await Promise.all([
    getRotaWeek(weekStart).catch(() => undefined),
    getActiveStaff().catch(() => undefined),
  ])

  return (
    <ScheduleClient
      initialData={initialData}
      initialStaff={initialStaff}
    />
  )
}
