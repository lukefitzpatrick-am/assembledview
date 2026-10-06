/**
 * Delete unpublished staged version rows for one MBA.
 * `line_items.version_id` cascades, so channel children go with the version.
 * A version is staged when `published_at` is null and `version_number` is
 * above the published watermark.
 */

import { and, eq, isNull, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { isUnpublishedStagedVersion } from "@/lib/mediaplan/publishedVersionGuard"

/** Channel tables that used to store per-version line items. Postgres uses `line_items`. */
export const STAGED_CHILD_SLUGS = [
  "media_plan_television",
  "media_plan_newspaper",
  "media_plan_social",
  "media_plan_radio",
  "media_plan_magazines",
  "media_plan_ooh",
  "media_plan_cinema",
  "media_plan_digi_display",
  "media_plan_digi_audio",
  "media_plan_digi_video",
  "media_plan_digi_bvod",
  "media_plan_integrations",
  "media_plan_search",
  "media_plan_prog_display",
  "media_plan_prog_video",
  "media_plan_prog_bvod",
  "media_plan_prog_audio",
] as const

export type ReapUnpublishedResult = {
  publishedVersionNumber: number
  orphanVersionNumbers: number[]
  deletedVersionIds: number[]
  deletedChildCount: number
  errors: string[]
}

function normaliseMba(mba: string): string {
  return String(mba ?? "").trim().toLowerCase()
}

/**
 * Delete staged version rows whose version_number was never published.
 * Not called from the MBA PUT (that route is 410). Callers that still
 * pass `allVersions` filter those rows the same way.
 */
export async function reapUnpublishedStagedVersions(opts: {
  mbaNumber: string
  mediaPlanMasterId: number | string
  publishedVersionNumber: number
  timeoutMs?: number
  /** Pre-fetched versions for this master; if omitted, loads from Postgres. */
  allVersions?: Array<{ id?: unknown; version_number?: unknown; published_at?: unknown }>
}): Promise<ReapUnpublishedResult> {
  const published = Math.max(0, opts.publishedVersionNumber)
  const errors: string[] = []
  const deletedVersionIds: number[] = []
  const orphanVersionNumbers: number[] = []
  let deletedChildCount = 0

  const db = getDb()

  type Candidate = { id: number; versionNumber: number }
  let candidates: Candidate[] = []

  if (opts.allVersions) {
    candidates = opts.allVersions
      .filter((v) => {
        if (v.published_at != null && String(v.published_at).trim() !== "") return false
        return isUnpublishedStagedVersion(v.version_number, published)
      })
      .map((v) => ({
        id: Number(v.id),
        versionNumber: Number(v.version_number),
      }))
      .filter((v) => Number.isFinite(v.id) && v.id > 0 && Number.isFinite(v.versionNumber))
  } else {
    const rows = await db
      .select({
        id: schema.mediaPlanVersions.id,
        versionNumber: schema.mediaPlanVersions.versionNumber,
      })
      .from(schema.mediaPlanVersions)
      .where(
        and(
          sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(opts.mbaNumber)}`,
          isNull(schema.mediaPlanVersions.publishedAt),
        ),
      )
    candidates = rows.filter((row) =>
      isUnpublishedStagedVersion(row.versionNumber, published),
    )
  }

  for (const orphan of candidates) {
    orphanVersionNumbers.push(orphan.versionNumber)
    try {
      const children = await db
        .select({ id: schema.lineItems.id })
        .from(schema.lineItems)
        .where(eq(schema.lineItems.versionId, orphan.id))
      deletedChildCount += children.length
      await db
        .delete(schema.mediaPlanVersions)
        .where(eq(schema.mediaPlanVersions.id, orphan.id))
      deletedVersionIds.push(orphan.id)
    } catch (err) {
      errors.push(
        `version ${orphan.id}: ${err instanceof Error ? err.message : "delete failed"}`,
      )
    }
  }

  return {
    publishedVersionNumber: published,
    orphanVersionNumbers,
    deletedVersionIds,
    deletedChildCount,
    errors,
  }
}
