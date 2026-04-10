import { ScheduleClient } from "@/app/(clinic)/schedule-client"

// Allow up to 5 minutes for hybrid (Claude) generation server actions
export const maxDuration = 300

export default function SchedulePage() {
  // Render client component immediately — it handles its own data fetching
  // This avoids the RSC flight hanging during client-side navigation
  return <ScheduleClient />
}
