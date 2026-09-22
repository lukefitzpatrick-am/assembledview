import "server-only"

import { and, eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { parseMbaNumberFromLineItemId } from "@/lib/mediaplan/lineItemIds"
import { cardChannelFromPlanLine, normalizeLineItemId } from "./shared/channels"
import type { RelabelPublishedLine } from "./shared/types"

/**
 * Published-version check: master's published_version_id + version.published_at,
 * and the line on that version. Never max(version_number).
 */
export async function lookupPublishedPlanLine(lineItemId: string): Promise<RelabelPublishedLine | null> {
  const id = normalizeLineItemId(lineItemId)
  if (!id) return null
  const mba = parseMbaNumberFromLineItemId(id)?.toLowerCase() ?? null
  const db = getDb()

  const rows = await db
    .select({
      lineItemId: schema.lineItems.lineItemId,
      lineChannel: schema.lineItems.channel,
      mbaNumber: schema.mediaPlanMasters.mbaNumber,
      publishedVersionId: schema.mediaPlanMasters.publishedVersionId,
      publishedAt: schema.mediaPlanVersions.publishedAt,
      versionId: schema.lineItems.versionId,
    })
    .from(schema.lineItems)
    .innerJoin(schema.mediaPlanVersions, eq(schema.lineItems.versionId, schema.mediaPlanVersions.id))
    .innerJoin(
      schema.mediaPlanMasters,
      eq(schema.mediaPlanVersions.masterId, schema.mediaPlanMasters.id),
    )
    .where(
      and(
        sql`lower(${schema.lineItems.lineItemId}) = ${id}`,
        mba ? sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${mba}` : undefined,
      ),
    )

  if (rows.length === 0) {
    return {
      lineItemId: id,
      mbaNumber: mba ?? "",
      lineChannel: "",
      cardChannel: "direct",
      published: false,
      onPublishedVersion: false,
    }
  }

  const onPublished = rows.find(
    (row) =>
      row.publishedVersionId != null &&
      row.versionId === row.publishedVersionId &&
      row.publishedAt != null,
  )
  const any = onPublished ?? rows[0]!
  const published = Boolean(any.publishedVersionId && any.publishedAt)
  return {
    lineItemId: normalizeLineItemId(any.lineItemId),
    mbaNumber: String(any.mbaNumber ?? mba ?? "").toLowerCase(),
    lineChannel: String(any.lineChannel ?? ""),
    cardChannel: cardChannelFromPlanLine(String(any.lineChannel ?? "")),
    published,
    onPublishedVersion: Boolean(onPublished),
  }
}
