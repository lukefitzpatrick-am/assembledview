/**
 * Live golden: Xano vs Postgres line-item assembly for ≥3 MBAs spanning ≥6 channels.
 * Requires DATABASE_URL + Xano env. Usage:
 *   npx tsx scripts/migration/shadow-smoke-plans.ts
 *
 * Xano path uses the same FK-first fetch as channel GETs (not bare mp_plannumber).
 */
import { loadEnvLocal } from "./_shared"
import { getDb, schema } from "@/db"
import { and, eq, sql } from "drizzle-orm"
import {
  __resetShadowDiffStoreForTests,
  compareReferenceRows,
  recordShadowDiff,
  summarizeShadowDiffs,
} from "@/lib/data/shadowDiff"
import {
  CHANNEL_LINE_ITEM_ENDPOINTS,
  fetchXanoTableForEndpoint,
  resolveVersionScopeForChannelGet,
} from "@/lib/api/fetchChannelLineItemsByMba"
import {
  BURSTS_FIELD_AS_BURSTS,
  CHANNEL_ENDPOINT_TO_CHANNEL,
  PLANS_DUPLICATE_CLASS_MBAS,
  mapLineItemFromPostgres,
  normalizeLineItemForCompare,
  type LineItemAssemblyContext,
} from "@/lib/data/planShapes"
import type { LineChannel } from "@/db/schema"
import { sortLineItemsByLineItemNumber } from "@/lib/mediaplan/lineItemIds"

const DOMAIN = "plans" as const

/** Production-heavy + fee-flag + clean multi-channel. */
const GOLDENS: Array<{ mba: string; minChannels: number; note: string }> = [
  { mba: "PENFOLD015", minChannels: 6, note: "production-heavy + client_pays" },
  { mba: "BICAU002", minChannels: 4, note: "budget_includes_fees (published has 4 active channels)" },
  { mba: "BICAU001", minChannels: 6, note: "clean multi-channel + production" },
]

function lineItemKey(row: Record<string, unknown>): string | null {
  const mba = String(row.mba_number ?? "")
    .trim()
    .toLowerCase()
  const line = String(row.line_item_id ?? "").trim()
  const vn = row.mp_plannumber ?? row.version_number ?? ""
  if (!mba || !line) return null
  return `plans:${mba}::${String(vn).trim()}::${line}`
}

async function assemblePg(
  mba: string,
  versionNumber: number,
  channel: LineChannel
): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const versions = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(
      and(
        sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${mba.toLowerCase()}`,
        eq(schema.mediaPlanVersions.versionNumber, versionNumber)
      )
    )
    .limit(1)
  const version = versions[0]
  if (!version) return []

  const masters = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, version.masterId))
    .limit(1)
  const master = masters[0]
  const ctx: LineItemAssemblyContext = {
    versionId: version.id,
    versionNumber: version.versionNumber,
    mbaNumber: version.mbaNumber,
    mpClientName: master?.mpClientName ?? null,
  }

  const rows = await db
    .select()
    .from(schema.lineItems)
    .where(
      and(eq(schema.lineItems.versionId, version.id), eq(schema.lineItems.channel, channel))
    )
  const mapped = rows.map((r) => mapLineItemFromPostgres(r as Record<string, unknown>, ctx))
  return sortLineItemsByLineItemNumber(mapped)
}

async function main() {
  loadEnvLocal()
  __resetShadowDiffStoreForTests()

  const report: Array<Record<string, unknown>> = []

  for (const { mba, minChannels } of GOLDENS) {
    const scope = await resolveVersionScopeForChannelGet(mba, {})
    const channelsPresent: string[] = []
    let unexpectedFieldDiffs = 0
    let duplicateClass = 0
    let unexpectedMissing = 0

    for (const endpoint of CHANNEL_LINE_ITEM_ENDPOINTS) {
      const channel = CHANNEL_ENDPOINT_TO_CHANNEL[endpoint]
      if (!channel) continue

      const [xanoRaw, pgRaw] = await Promise.all([
        fetchXanoTableForEndpoint(
          endpoint,
          mba,
          scope.versionNumber,
          scope.mediaPlanVersionId,
          `SMOKE_${endpoint}`
        ),
        assemblePg(mba, scope.versionNumber, channel),
      ])
      if (xanoRaw.length === 0 && pgRaw.length === 0) continue
      channelsPresent.push(channel)

      const xanoKeyed = (xanoRaw as Record<string, unknown>[]).map(
        normalizeLineItemForCompare
      )
      const pgKeyed = pgRaw.map(normalizeLineItemForCompare)

      const event = compareReferenceRows(endpoint, xanoKeyed, pgKeyed, {
        domain: DOMAIN,
        postgresKeysOnly: true,
        financeDuplicateClass: true,
        duplicateNaturalKey: lineItemKey,
      })

      if (
        PLANS_DUPLICATE_CLASS_MBAS.has(mba.toLowerCase()) &&
        event.missingInPostgres.length > 0
      ) {
        event.duplicateClassMissingInPostgres = [
          ...new Set([
            ...(event.duplicateClassMissingInPostgres ?? []),
            ...event.missingInPostgres,
          ]),
        ]
        event.diffClass =
          event.missingInXano.length === 0 && event.fieldDiffs.length === 0
            ? "duplicate-class"
            : "unexpected"
      }

      recordShadowDiff(event)

      const dup = new Set(event.duplicateClassMissingInPostgres ?? [])
      const unexpectedMiss = event.missingInPostgres.filter((id) => !dup.has(id))
      unexpectedMissing += unexpectedMiss.length
      duplicateClass += dup.size
      unexpectedFieldDiffs += event.fieldDiffs.length

      if (pgRaw.length > 0 && BURSTS_FIELD_AS_BURSTS.has(channel)) {
        const sample = pgRaw[0]
        if (!("bursts" in sample)) {
          throw new Error(`${channel} missing bursts key`)
        }
      }
    }

    report.push({
      mba,
      version: scope.versionNumber,
      versionId: scope.mediaPlanVersionId,
      channelsPresent: channelsPresent.length,
      minChannelsOk: channelsPresent.length >= minChannels,
      channels: channelsPresent.sort(),
      unexpectedMissing,
      duplicateClass,
      unexpectedFieldDiffs,
    })
  }

  const db = getDb()
  const debris = await db.execute(sql`
    SELECT m.mba_number, m.published_version_id,
      (SELECT max(v.version_number) FROM media_plan_versions v WHERE v.master_id = m.id) AS max_vn
    FROM media_plan_masters m
    WHERE m.published_version_id IS NULL
  `)
  const debrisRows = ((debris as any).rows ?? debris) as Array<Record<string, unknown>>

  const summary = summarizeShadowDiffs(60_000)
  const plans = summary.byDomain.find((d) => d.domain === DOMAIN)

  console.log(
    JSON.stringify(
      {
        goldens: report,
        debrisMasters: debrisRows,
        byDomain: plans ?? null,
      },
      null,
      2
    )
  )

  const hardFail = report.filter((r) => {
    if (r.error || r.minChannelsOk === false) return true
    if (Number(r.unexpectedFieldDiffs) > 0) return true
    if (PLANS_DUPLICATE_CLASS_MBAS.has(String(r.mba).toLowerCase())) return false
    return Number(r.unexpectedMissing) > 0
  })
  if (hardFail.length > 0) {
    console.error("GOLDEN FAIL", hardFail)
    process.exit(1)
  }
  console.log("GOLDEN OK")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
