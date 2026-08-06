/**
 * VC Stage 1 — stamp Postgres `media_plan_versions.published_at` / `published_by`
 * for the legacy Xano MBA PUT/PATCH publish path (best-effort).
 *
 * Does not throw on missing rows — Xano-only tips may lack a Postgres mirror.
 * Never clears an existing stamp when called; always sets now() + normalised by.
 */
import { and, eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { normalisePublishedByEmail } from "@/lib/mediaplan/versionPublication"

function normaliseMba(mba: string): string {
  return String(mba ?? "").trim().toLowerCase()
}

export async function stampVersionPublicationByMbaVersion(args: {
  mbaNumber: string
  versionNumber: number
  publishedByEmail?: string | null
}): Promise<{ stamped: boolean; versionId: number | null }> {
  const vn = Number(args.versionNumber)
  if (!Number.isFinite(vn) || vn <= 0) {
    return { stamped: false, versionId: null }
  }

  const publishedBy = normalisePublishedByEmail(args.publishedByEmail)
  const db = getDb()
  const updated = await db
    .update(schema.mediaPlanVersions)
    .set({
      publishedAt: sql`now()`,
      publishedBy,
    })
    .where(
      and(
        sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(args.mbaNumber)}`,
        eq(schema.mediaPlanVersions.versionNumber, vn)
      )
    )
    .returning({ id: schema.mediaPlanVersions.id })

  const versionId = updated[0]?.id ?? null
  if (versionId == null) {
    console.warn(
      "[stampVersionPublication] no Postgres version row to stamp",
      { mba: args.mbaNumber, versionNumber: vn }
    )
  }
  return { stamped: versionId != null, versionId }
}

/**
 * VC Stage 1 — read Postgres `published_at` for mba+version (legacy PUT gate).
 * Returns null when no mirror row exists (treat as unpublished for overwrite).
 */
export async function readVersionPublishedAtByMbaVersion(args: {
  mbaNumber: string
  versionNumber: number
}): Promise<string | null> {
  const vn = Number(args.versionNumber)
  if (!Number.isFinite(vn) || vn <= 0) return null

  const db = getDb()
  const rows = await db
    .select({ publishedAt: schema.mediaPlanVersions.publishedAt })
    .from(schema.mediaPlanVersions)
    .where(
      and(
        sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(args.mbaNumber)}`,
        eq(schema.mediaPlanVersions.versionNumber, vn)
      )
    )
    .limit(1)

  const at = rows[0]?.publishedAt
  return at != null ? String(at) : null
}
