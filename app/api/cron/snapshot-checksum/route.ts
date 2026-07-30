import { NextResponse } from "next/server"
import { desc, isNotNull } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { computeChecksumForVersionId } from "@/lib/docs/buildMbaFromPersisted"

export const dynamic = "force-dynamic"
export const maxDuration = 120
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * PC3 weekly tripwire — recompute snapshot_checksum vs stored for recent
 * published versions. Report-only (never writes).
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization Bearer.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  const limitParam = Number(new URL(request.url).searchParams.get("limit") || "50")
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200)

  const db = getDb()
  const versions = await db
    .select({
      id: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      snapshotChecksum: schema.mediaPlanVersions.snapshotChecksum,
    })
    .from(schema.mediaPlanVersions)
    .where(isNotNull(schema.mediaPlanVersions.snapshotChecksum))
    .orderBy(desc(schema.mediaPlanVersions.id))
    .limit(limit)

  const mismatches: Array<{
    versionId: number
    mba: string
    versionNumber: number
    stored: string | null
    computed: string
  }> = []
  let checked = 0
  let missingStored = 0

  for (const v of versions) {
    try {
      const { checksumHex, stored } = await computeChecksumForVersionId(v.id)
      checked += 1
      if (!stored) {
        missingStored += 1
        continue
      }
      if (stored !== checksumHex) {
        mismatches.push({
          versionId: v.id,
          mba: v.mbaNumber,
          versionNumber: v.versionNumber,
          stored,
          computed: checksumHex,
        })
      }
    } catch (err) {
      console.error("[snapshot-checksum-tripwire] version failed", v.id, err)
    }
  }

  const report = {
    event: "snapshot_checksum_tripwire",
    checked,
    limit,
    mismatchCount: mismatches.length,
    missingStored,
    mismatches: mismatches.slice(0, 50),
  }
  console.log(JSON.stringify(report))

  return NextResponse.json(report)
}
