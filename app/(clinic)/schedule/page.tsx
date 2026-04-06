import { getRotaWeek, getActiveStaff } from "@/app/(clinic)/rota/actions"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { ScheduleClient } from "@/app/(clinic)/schedule-client"
import { hasEnabledRecipients } from "@/app/(clinic)/notifications-actions"
import { getWeekNotes } from "@/app/(clinic)/notes-actions"

export default async function SchedulePage() {
  const weekStart = getMondayOfWeek()

  // Fetch initial data on the server — eliminates client-side waterfall
  // Errors are caught so the page still renders (client will retry)
  const [initialData, initialStaff, hasNotifications, initialNotes] = await Promise.all([
    getRotaWeek(weekStart).catch((e) => { console.error("[schedule] getRotaWeek failed:", e.message); return undefined }),
    getActiveStaff().catch((e) => { console.error("[schedule] getActiveStaff failed:", e.message); return undefined }),
    hasEnabledRecipients().catch((e) => { console.error("[schedule] hasEnabledRecipients failed:", e.message); return false }),
    getWeekNotes(weekStart).catch((e) => { console.error("[schedule] getWeekNotes failed:", e.message); return undefined }),
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
