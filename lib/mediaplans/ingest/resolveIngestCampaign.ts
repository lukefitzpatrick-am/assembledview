/**
 * Look up masterId for an MBA. Never invent a campaign — missing MBA is a
 * caller error (ask the user). Used by chat accept after MBA is known.
 */

import { eq } from "drizzle-orm"
import type { AcceptCampaignTarget } from "@/lib/mediaplans/ingest/acceptIngestProposal"

export async function resolveIngestCampaignFromDb(
  mbaNumber: string,
  versionNumber?: number,
): Promise<AcceptCampaignTarget | { error: string }> {
  const mba = mbaNumber.trim()
  if (!mba) {
    return { error: "Which MBA / campaign should this schedule attach to? AVA will not guess." }
  }
  const { db } = await import("@/db")
  const { mediaPlanMasters } = await import("@/db/schema/planCore")
  const [master] = await db
    .select({ id: mediaPlanMasters.id })
    .from(mediaPlanMasters)
    .where(eq(mediaPlanMasters.mbaNumber, mba))
    .limit(1)
  if (!master) {
    return { error: `No media plan master for MBA "${mba}".` }
  }
  return {
    masterId: master.id,
    mbaNumber: mba,
    versionNumber: versionNumber ?? 1,
    mode: "draft",
  }
}
