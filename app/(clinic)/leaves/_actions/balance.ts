"use server"

import { isHrModuleActive, checkLeaveRequestBalance } from "@/lib/hr-leave-integration"
import { getOrgId } from "@/lib/get-org-id"

/** Client-side live preview: returns balance info for the given staff/type/dates, or null if HR module is inactive. */
export async function previewLeaveBalance(params: {
  staffId: string
  type: string
  startDate: string
  endDate: string
}): Promise<Awaited<ReturnType<typeof checkLeaveRequestBalance>> | null> {
  const orgId = await getOrgId()
  if (!orgId) return null
  if (!await isHrModuleActive(orgId)) return null
  try {
    return await checkLeaveRequestBalance({
      orgId,
      staffId: params.staffId,
      legacyType: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
    })
  } catch {
    return null
  }
}
