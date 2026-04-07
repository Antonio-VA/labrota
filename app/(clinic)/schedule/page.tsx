import { getRotaWeek, getActiveStaff } from "@/app/(clinic)/rota/actions"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { ScheduleClient } from "@/app/(clinic)/schedule-client"
import { hasEnabledRecipients } from "@/app/(clinic)/notifications-actions"
import { getWeekNotes } from "@/app/(clinic)/notes-actions"

/** Race a promise against a timeout — returns fallback if the promise takes too long */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

export default async function SchedulePage() {
  const weekStart = getMondayOfWeek()

  // Fetch initial data on the server — eliminates client-side waterfall
  // Errors are caught and timeouts enforced so the page always renders
  // (client component will retry fetches that failed or timed out)
  const [initialData, initialStaff, hasNotifications, initialNotes] = await Promise.all([
    withTimeout(getRotaWeek(weekStart), 8000, undefined).catch((e) => { console.error("[schedule] getRotaWeek failed:", e.message); return undefined }),
    withTimeout(getActiveStaff(), 8000, undefined).catch((e) => { console.error("[schedule] getActiveStaff failed:", e.message); return undefined }),
    withTimeout(hasEnabledRecipients(), 5000, false).catch((e) => { console.error("[schedule] hasEnabledRecipients failed:", e.message); return false }),
    withTimeout(getWeekNotes(weekStart), 5000, undefined).catch((e) => { console.error("[schedule] getWeekNotes failed:", e.message); return undefined }),
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
