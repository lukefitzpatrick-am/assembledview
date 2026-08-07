/**
 * VC Stage 2a — published versions are immutable at the persistence layer.
 *
 * Sibling of `isVersionPublished` in `versionPublication.ts` (kept separate so
 * client imports of the predicate do not pull `server-only` / DB).
 *
 * Keys off `published_at` only — never `campaign_status`. Billing writers keep
 * their own `assertVersionBillingMutable` (approved-or-beyond) until Stage 2
 * P3; do not merge the two predicates.
 */
import "server-only"

import { eq } from "drizzle-orm"

import { getDb, schema, type Db } from "@/db"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

export class VersionImmutableError extends Error {
  readonly code = "VERSION_PUBLISHED_IMMUTABLE" as const

  constructor(message: string) {
    super(message)
    this.name = "VersionImmutableError"
  }
}

/**
 * Throws `VersionImmutableError` (`VERSION_PUBLISHED_IMMUTABLE`) when the
 * version row has a non-null `published_at`. Call before mutating version
 * contents (draft overwrite, line_items, schedule_months, etc.).
 */
export async function assertVersionMutable(
  versionId: number,
  db: Db = getDb()
): Promise<void> {
  const id = Number(versionId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new VersionImmutableError(
      "VERSION_PUBLISHED_IMMUTABLE: version id is required"
    )
  }

  const [row] = await db
    .select({
      id: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      publishedAt: schema.mediaPlanVersions.publishedAt,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, id))
    .limit(1)

  if (!row) {
    throw new VersionImmutableError(
      `VERSION_PUBLISHED_IMMUTABLE: version ${id} not found`
    )
  }

  if (!isVersionPublished(row)) return

  throw new VersionImmutableError(
    `VERSION_PUBLISHED_IMMUTABLE: version ${row.id} (v${row.versionNumber}) — published versions are immutable at the persistence layer. Publish a new version to change plan contents.`
  )
}
