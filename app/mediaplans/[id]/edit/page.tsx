import { eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { getDb, schema } from "@/db"

export const dynamic = "force-dynamic"

/**
 * Legacy `/mediaplans/{id}/edit` URLs redirect to the canonical MBA editor.
 * `id` is a Postgres `media_plan_versions.id`.
 */
export default async function LegacyMediaPlanEditRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const versionId = Number(id)
  if (!Number.isFinite(versionId) || versionId <= 0) {
    notFound()
  }

  const db = getDb()
  const rows = await db
    .select({
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
    .limit(1)

  const row = rows[0]
  const mbaNumber = (row?.mbaNumber ?? "").trim()
  if (!mbaNumber) {
    notFound()
  }

  const versionQuery =
    row.versionNumber != null
      ? `?version=${encodeURIComponent(String(row.versionNumber))}`
      : ""

  redirect(`/mediaplans/mba/${encodeURIComponent(mbaNumber)}/edit${versionQuery}`)
}
