import { getCachedOrgId } from "@/lib/auth-cache"

/** Get the authenticated user's organisation_id.
 *  Uses React cache() so multiple calls in a single request are deduplicated. */
export async function getOrgId(): Promise<string | null> {
  return getCachedOrgId()
}
