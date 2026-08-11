/**
 * Server-side MBA ownership for a media_plan_versions.id.
 * Used by billing-overrides GET (query has version id only) so tenants
 * cannot be scoped from a client-supplied mba_number.
 */
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"

export async function resolveMbaNumberForVersionId(
  versionId: string | number
): Promise<string | null> {
  const numericId = Number(versionId)
  if (!Number.isFinite(numericId) || numericId <= 0) return null

  const db = getDb()
  const rows = await db
    .select({ mbaNumber: schema.mediaPlanVersions.mbaNumber })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, numericId))
    .limit(1)

  const mba = rows[0]?.mbaNumber
  if (mba == null || String(mba).trim() === "") return null
  return String(mba).trim()
}
