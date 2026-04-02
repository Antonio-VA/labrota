import { getMondayOfWeek } from "@/lib/rota-engine"
import { getRotaWeek } from "@/app/(clinic)/rota/actions"
import { ScheduleClient } from "./schedule-client"

export default async function SchedulePage() {
  const weekStart = getMondayOfWeek(new Date())
  const initialData = await getRotaWeek(weekStart)

  return <ScheduleClient initialData={initialData} />
}
