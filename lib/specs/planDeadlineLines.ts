/**
 * Published-plan publisher join for material-deadline derivation.
 *
 * mba_number → media_plan_masters.published_version_id → line_items
 * (never max(versions)). Structured deadlines prefer publisher_specs
 * min/max/business columns; fall back to a read-time parse of the MI
 * Supply Deadline cell only when the row is missing or columns are NULL.
 */

import { eq, inArray } from "drizzle-orm"

import { db, type Db } from "@/db"
import { lineItems, mediaPlanMasters, mediaPlanVersions } from "@/db/schema/planCore"
import { publisherSpecs } from "@/db/schema/publisherSpecs"
import {
  liveInstantToSydneyYmd,
  type MaterialDeadlineLine,
} from "./deriveMaterialDeadlines.js"
import { resolveMiPlan } from "./resolve.js"
import { structuredDeadlineFromSpecColumns } from "./structuredDeadlineFromSpecColumns.js"

const CHANNEL_TO_FLATTEN: Record<string, string> = {
  television: "television",
  radio: "radio",
  cinema: "cinema",
  newspaper: "newspaper",
  magazines: "magazines",
  ooh: "ooh",
  prog_display: "progDisplay",
  prog_video: "progVideo",
  prog_audio: "progAudio",
  prog_bvod: "progBvod",
  prog_ooh: "progOoh",
  digi_display: "digitalDisplay",
  digi_video: "digitalVideo",
  digi_audio: "digitalAudio",
  digi_bvod: "bvod",
  social: "socialMedia",
  search: "search",
  influencers: "socialMedia",
  integrations: "integration",
  production: "production",
}

export async function loadPublishedPlanDeadlineLines(
  mbaNumber: string,
  database: Db = db,
): Promise<MaterialDeadlineLine[]> {
  const mba = mbaNumber.trim()
  if (!mba) return []
  try {
    const [master] = await database
      .select({
        publishedVersionId: mediaPlanMasters.publishedVersionId,
      })
      .from(mediaPlanMasters)
      .where(eq(mediaPlanMasters.mbaNumber, mba))
      .limit(1)
    const versionId = master?.publishedVersionId
    if (versionId == null) return []

    const [version] = await database
      .select({ publishedAt: mediaPlanVersions.publishedAt })
      .from(mediaPlanVersions)
      .where(eq(mediaPlanVersions.id, versionId))
      .limit(1)
    if (!version?.publishedAt) return []

    const rows = await database
      .select({
        lineItemId: lineItems.lineItemId,
        channel: lineItems.channel,
        publisher: lineItems.publisher,
        bursts: lineItems.bursts,
        attrs: lineItems.attrs,
      })
      .from(lineItems)
      .where(eq(lineItems.versionId, versionId))

    const grouped: Record<string, unknown[]> = {}
    for (const row of rows) {
      const key = CHANNEL_TO_FLATTEN[row.channel] ?? row.channel
      const attrs =
        row.attrs && typeof row.attrs === "object" && !Array.isArray(row.attrs)
          ? (row.attrs as Record<string, unknown>)
          : {}
      if (!grouped[key]) grouped[key] = []
      grouped[key].push({
        line_item_id: row.lineItemId,
        publisher: row.publisher,
        bursts: row.bursts,
        ...attrs,
      })
    }

    const resolved = resolveMiPlan({ lineItems: grouped })
    const slugs = [
      ...new Set(
        resolved.resolved
          .map((item) => item.publisher_slug)
          .filter((slug): slug is string => Boolean(slug)),
      ),
    ]
    const specRows = slugs.length === 0
      ? []
      : await database
        .select({
          publisherSlug: publisherSpecs.publisherSlug,
          supplyDeadlineMinDays: publisherSpecs.supplyDeadlineMinDays,
          supplyDeadlineMaxDays: publisherSpecs.supplyDeadlineMaxDays,
          supplyDeadlineBusinessDays: publisherSpecs.supplyDeadlineBusinessDays,
        })
        .from(publisherSpecs)
        .where(inArray(publisherSpecs.publisherSlug, slugs))
    const columnsBySlug = new Map(
      specRows.map((row) => [row.publisherSlug, row] as const),
    )
    return resolved.resolved.map((item) => ({
      publisherKey: item.publisher_slug ?? "",
      publisherLabel:
        item.fields_am.Publisher
        || item.fields_client.Publisher
        || item.publisher_slug
        || "",
      liveYmd: liveInstantToSydneyYmd(item.fields_am["Live Date"]),
      structured: structuredDeadlineFromSpecColumns(
        item.publisher_slug ? columnsBySlug.get(item.publisher_slug) ?? null : null,
        item.fields_specs["Supply Deadline"],
      ),
    }))
  } catch {
    return []
  }
}
