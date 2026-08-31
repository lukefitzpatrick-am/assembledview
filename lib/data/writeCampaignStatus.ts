/**
 * CS-B — commercial status is a master fact.
 * Writes media_plan_masters.campaign_status only. Never touches
 * media_plan_versions and never calls savePlanVersion.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import {
  getDraftReturnRejection,
  isSelectableCampaignStatus,
  normaliseStatus,
  type SelectableCampaignStatus,
} from "@/lib/mediaplan/campaignStatusGuard"

export class CampaignStatusWriteError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "INVALID_STATUS" | "DRAFT_RETURN",
    message: string,
    public readonly status: 404 | 422 = 422
  ) {
    super(message)
    this.name = "CampaignStatusWriteError"
  }
}

export async function writeCampaignStatus(
  mbaNumber: string,
  status: unknown
): Promise<{ mbaNumber: string; status: SelectableCampaignStatus }> {
  const trimmedMba = String(mbaNumber ?? "").trim()
  if (!trimmedMba) {
    throw new CampaignStatusWriteError("NOT_FOUND", "MBA number required", 404)
  }

  if (!isSelectableCampaignStatus(status)) {
    throw new CampaignStatusWriteError(
      "INVALID_STATUS",
      "status must be one of planned, approved, booked, cancelled"
    )
  }
  const next = normaliseStatus(status) as SelectableCampaignStatus

  const db = getDb()
  const [master] = await db
    .select({
      id: schema.mediaPlanMasters.id,
      campaignStatus: schema.mediaPlanMasters.campaignStatus,
    })
    .from(schema.mediaPlanMasters)
    .where(
      sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${trimmedMba.toLowerCase()}`
    )
    .limit(1)

  if (!master) {
    throw new CampaignStatusWriteError(
      "NOT_FOUND",
      `Media plan master not found for MBA number: ${trimmedMba}`,
      404
    )
  }

  const draftReturn = getDraftReturnRejection(master.campaignStatus, next)
  if (draftReturn) {
    throw new CampaignStatusWriteError(
      "DRAFT_RETURN",
      draftReturn.error,
      draftReturn.status
    )
  }

  await db
    .update(schema.mediaPlanMasters)
    .set({ campaignStatus: next })
    .where(eq(schema.mediaPlanMasters.id, master.id))

  return { mbaNumber: trimmedMba, status: next }
}
