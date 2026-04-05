import { redirect } from "next/navigation"

// The schedule page has moved to /schedule.
// Authenticated users landing on / are redirected there by middleware,
// but this redirect acts as a fallback in case they get through.
export default function RootRedirect() {
  redirect("/schedule")
}
