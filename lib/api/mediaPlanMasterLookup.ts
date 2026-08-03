/**
 * MBA uniqueness lookup for media_plan_masters.
 * X9: Postgres is identity authority (was Xano GET).
 */
import { findExistingMasterByMbaNumberPostgres } from "@/lib/data/writeMediaPlanMasters"

/**
 * Returns an existing media_plan_master row for this MBA number, or null.
 * Used before creating a new master to avoid duplicate mba_number rows.
 */
export async function findExistingMasterByMbaNumber(
  mbaNumber: string
): Promise<{ id: number } | null> {
  return findExistingMasterByMbaNumberPostgres(mbaNumber)
}
