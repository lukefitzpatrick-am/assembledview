import { eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"
import {
  buildPublishedDocumentsPayload,
  unpublishedDocumentsPayload,
  type PublishedDocumentsPayload,
  type VersionDocumentFiles,
} from "@/lib/docs/planVersionFiles"

export type VersionForDownload = VersionDocumentFiles & {
  id: number
  mbaNumber: string
  versionNumber: number
  publishedAt: string | null
}

function normaliseMba(mba: string): string {
  return mba.trim().toLowerCase()
}

export async function readPublishedDocumentsByMba(
  mbaNumber: string,
): Promise<{ ok: true; payload: PublishedDocumentsPayload } | { ok: false; status: 404 }> {
  const db = getDb()
  const mba = normaliseMba(mbaNumber)
  const [master] = await db
    .select({
      id: schema.mediaPlanMasters.id,
      publishedVersionId: schema.mediaPlanMasters.publishedVersionId,
    })
    .from(schema.mediaPlanMasters)
    .where(sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${mba}`)
    .limit(1)

  if (!master) return { ok: false, status: 404 }
  if (!master.publishedVersionId) {
    return { ok: true, payload: unpublishedDocumentsPayload() }
  }

  const [version] = await db
    .select({
      id: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      publishedAt: schema.mediaPlanVersions.publishedAt,
      mbaPdfFile: schema.mediaPlanVersions.mbaPdfFile,
      mediaPlanFile: schema.mediaPlanVersions.mediaPlanFile,
      aaMediaPlanFile: schema.mediaPlanVersions.aaMediaPlanFile,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, master.publishedVersionId))
    .limit(1)

  if (!version || !isVersionPublished(version)) {
    return { ok: true, payload: unpublishedDocumentsPayload() }
  }

  return {
    ok: true,
    payload: buildPublishedDocumentsPayload({
      id: version.id,
      versionNumber: version.versionNumber,
      publishedAt: version.publishedAt,
      mbaPdfFile: version.mbaPdfFile,
      mediaPlanFile: version.mediaPlanFile,
      aaMediaPlanFile: version.aaMediaPlanFile,
    }),
  }
}

export async function readVersionForDownload(id: number): Promise<VersionForDownload | null> {
  const db = getDb()
  const [version] = await db
    .select({
      id: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      publishedAt: schema.mediaPlanVersions.publishedAt,
      mbaPdfFile: schema.mediaPlanVersions.mbaPdfFile,
      mediaPlanFile: schema.mediaPlanVersions.mediaPlanFile,
      aaMediaPlanFile: schema.mediaPlanVersions.aaMediaPlanFile,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, id))
    .limit(1)

  return version ?? null
}
