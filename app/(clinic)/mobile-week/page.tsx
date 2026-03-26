import { createClient } from "@/lib/supabase/server"
import { getRotaWeek } from "@/app/(clinic)/rota/actions"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { MobileWeekView } from "@/components/mobile-week-view"

export default async function MobileWeekPage() {
  const weekStart = getMondayOfWeek(new Date())
  const data = await getRotaWeek(weekStart)

  return (
    <div className="flex-1 overflow-hidden flex flex-col md:hidden">
      <MobileWeekView data={data} weekStart={weekStart} />
    </div>
  )
}
