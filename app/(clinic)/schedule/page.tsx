import { ScheduleClient } from "@/app/(clinic)/schedule-client"

export default function SchedulePage() {
  // Render client component immediately — it handles its own data fetching
  // This avoids the RSC flight hanging during client-side navigation
  return <ScheduleClient />
}
