import { ScheduleClient } from "@/app/(clinic)/schedule-client"

// Allow up to 5 minutes for hybrid (Claude) generation server actions
export const maxDuration = 300

// Client-side fetching only: the window-pinned cache in useRotaData serves
// revisits instantly, while cold loads fall through to getRotaWeek on mount.
// Keeping this server component thin avoids blocking navigation on a DB round-trip.
export default function SchedulePage() {
  return <ScheduleClient />
}
