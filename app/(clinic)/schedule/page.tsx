import { getRotaWeek, getActiveStaff } from "@/app/(clinic)/rota/actions"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { ScheduleClient } from "@/app/(clinic)/schedule-client"
import { hasEnabledRecipients } from "@/app/(clinic)/notifications-actions"

export default async function SchedulePage() {
  const weekStart = getMondayOfWeek()

  // Fetch initial data on the server — eliminates client-side waterfall
  const [initialData, initialStaff, hasNotifications] = await Promise.all([
    getRotaWeek(weekStart).catch(() => undefined),
    getActiveStaff().catch(() => undefined),
    hasEnabledRecipients().catch(() => false),
  ])

  return (
    <ScheduleClient
      initialData={initialData}
      initialStaff={initialStaff}
      hasNotifications={hasNotifications}
    />
  )
}
