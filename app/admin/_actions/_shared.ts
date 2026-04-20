import "server-only"
import { createClient } from "@/lib/supabase/server"

export async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "super_admin") {
    throw new Error("Unauthorised")
  }
}

export const COVERAGE_PRESETS: Record<string, object> = {
  standard: {
    mon: { lab: 3, andrology: 1, admin: 1 }, tue: { lab: 3, andrology: 1, admin: 1 },
    wed: { lab: 3, andrology: 1, admin: 1 }, thu: { lab: 3, andrology: 1, admin: 1 },
    fri: { lab: 3, andrology: 1, admin: 1 }, sat: { lab: 1, andrology: 0, admin: 0 },
    sun: { lab: 0, andrology: 0, admin: 0 },
  },
  minimal: {
    mon: { lab: 2, andrology: 1, admin: 1 }, tue: { lab: 2, andrology: 1, admin: 1 },
    wed: { lab: 2, andrology: 1, admin: 1 }, thu: { lab: 2, andrology: 1, admin: 1 },
    fri: { lab: 2, andrology: 1, admin: 1 }, sat: { lab: 1, andrology: 0, admin: 0 },
    sun: { lab: 0, andrology: 0, admin: 0 },
  },
  andrology: {
    mon: { lab: 3, andrology: 2, admin: 1 }, tue: { lab: 3, andrology: 2, admin: 1 },
    wed: { lab: 3, andrology: 2, admin: 1 }, thu: { lab: 3, andrology: 2, admin: 1 },
    fri: { lab: 3, andrology: 2, admin: 1 }, sat: { lab: 1, andrology: 1, admin: 0 },
    sun: { lab: 0, andrology: 0, admin: 0 },
  },
}

export const DEFAULT_PUNCTIONS_BY_DAY = { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 2, sun: 0 }
