/**
 * Server half of the S1 publish validation set (B54). Every publish path calls
 * one of these two before it stamps `published_at` or moves
 * `published_version_id`:
 * - `savePlanVersion` (POST /api/plans/save; the schedule ingest accept saves
 *   drafts only): `publishRefusal` on the lines it is about to write.
 * - `publishBillingRevision` (billing revisions and true-ups that publish; a
 *   credit-only note is exempt) and the PATCH publish stamp on
 *   `/api/mediaplans/mba/[mba_number]`: `publishRefusalForVersion` on the
 *   version's stored lines.
 *
 * Off (`publish_validation`): null, with no extra read. The rules live in
 * `lib/mediaplan/publishValidation.ts`.
 */
import "server-only"

import { sql } from "drizzle-orm"

import type { Db } from "@/db"
import { isFeatureOn } from "@/lib/features/server"
import {
  publishRefusalBody,
  validatePlanForPublish,
  type PublishPlan,
  type PublishRefusalBody,
} from "@/lib/mediaplan/publishValidation"
import { rowsOf } from "@/lib/xero/dbRows"

const switchOn = () => isFeatureOn("publish_validation")

/** The refusal body, or null when the switch is off or nothing is refused. */
export async function publishRefusal(plan: PublishPlan): Promise<PublishRefusalBody | null> {
  if (!(await switchOn())) return null
  const { refuse } = validatePlanForPublish(plan)
  return refuse.length > 0 ? publishRefusalBody(refuse) : null
}

/** One row of a version's plan dates and line, as both stored-version reads select it. */
export type VersionLineRow = {
  campaign_start_date: string | null
  campaign_end_date: string | null
  line_item_id: string | null
  channel: string | null
  buy_type: string | null
  publisher: string | null
  platform: string | null
  attrs: Record<string, unknown> | null
  bursts: unknown
}

/**
 * The same check on a version already in the database (its plan dates and
 * line_items). No version row: null; the caller's own lookup answers that.
 */
export async function publishRefusalForVersion(
  db: Pick<Db, "execute">,
  version: { versionId: number } | { mbaNumber: string; versionNumber: number },
): Promise<PublishRefusalBody | null> {
  if (!(await switchOn())) return null
  const where =
    "versionId" in version
      ? sql`v.id = ${version.versionId}`
      : sql`lower(v.mba_number) = lower(${version.mbaNumber}) AND v.version_number = ${version.versionNumber}`
  const rows = rowsOf<VersionLineRow>(
    await db.execute(sql`
      SELECT v.campaign_start_date::text AS campaign_start_date, v.campaign_end_date::text AS campaign_end_date,
        li.line_item_id, li.channel::text AS channel, li.buy_type, li.publisher, li.platform, li.attrs, li.bursts
      FROM media_plan_versions v
      LEFT JOIN line_items li ON li.version_id = v.id
      WHERE ${where}
      ORDER BY li.position
    `),
  )
  if (rows.length === 0) return null
  const { refuse } = validatePlanForPublish(publishPlanFromRows(rows))
  return refuse.length > 0 ? publishRefusalBody(refuse) : null
}

/** A stored version's rows (one per line, or one with no line) as the plan the rules check. */
export function publishPlanFromRows(rows: readonly VersionLineRow[]): PublishPlan {
  return {
    campaignStartDate: rows[0]?.campaign_start_date ?? null,
    campaignEndDate: rows[0]?.campaign_end_date ?? null,
    lineItems: rows
      .filter((r) => r.line_item_id != null)
      .map((r) => ({
        lineItemId: String(r.line_item_id),
        channel: String(r.channel ?? ""),
        buyType: r.buy_type,
        publisher: r.publisher,
        platform: r.platform,
        attrs: r.attrs,
        bursts: r.bursts,
      })),
  }
}
