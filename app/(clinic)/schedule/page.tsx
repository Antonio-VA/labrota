import { getRotaWeek } from "@/app/(clinic)/rota/actions"
import { ScheduleClient } from "@/app/(clinic)/schedule-client"

function getCurrentWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day  // Monday
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  return mon.toISOString().split("T")[0]
}

export default async function SchedulePage() {
  const weekStart = getCurrentWeekStart()
  const initialData = await getRotaWeek(weekStart).catch(() => undefined)
  return (
    <ScheduleClient
      initialData={initialData}
      initialStaff={initialData?.activeStaff}
    />
  )
}
