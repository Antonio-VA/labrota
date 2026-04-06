import { getRotaWeek, getActiveStaff } from "@/app/(clinic)/rota/actions"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { ScheduleClient } from "@/app/(clinic)/schedule-client"
import { hasEnabledRecipients } from "@/app/(clinic)/notifications-actions"
import { getWeekNotes } from "@/app/(clinic)/notes-actions"

export default async function SchedulePage() {
  const weekStart = getMondayOfWeek()

  // Fetch initial data on the server — eliminates client-side waterfall
  const [initialData, initialStaff, hasNotifications, initialNotes] = await Promise.all([
    getRotaWeek(weekStart).catch(() => undefined),
    getActiveStaff().catch(() => undefined),
    hasEnabledRecipients().catch(() => false),
    getWeekNotes(weekStart).catch(() => undefined),
  ])

  return (
    <ScheduleClient
      initialData={initialData}
      initialStaff={initialStaff}
      hasNotifications={hasNotifications}
      initialNotes={initialNotes}
    />
  )
}
