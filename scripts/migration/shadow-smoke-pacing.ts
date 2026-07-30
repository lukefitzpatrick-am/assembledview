/**
 * One-shot shadow smoke for pacing-owned Xano tables (T2d verify).
 * Avoids importing `server-only` modules — mirrors the reader compare path.
 * Usage: npx tsx scripts/migration/shadow-smoke-pacing.ts
 */
import { loadEnvLocal } from "./_shared"
import { getDb, schema } from "@/db"
import {
  __resetShadowDiffStoreForTests,
  compareReferenceRows,
  recordShadowDiff,
  summarizeShadowDiffs,
} from "@/lib/data/shadowDiff"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { xanoAuthHeader, xanoUrl } from "@/lib/api/xano"

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const DOMAIN = "pacing" as const

function createdAtMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : undefined
  }
  return undefined
}

function mapMaster(
  master: Record<string, unknown>,
  publishedVersion: Record<string, unknown> | null
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(master))
  const cents = api.campaign_budget_cents
  let mpCampaignbudget = 0
  if (typeof cents === "number" && Number.isFinite(cents)) mpCampaignbudget = cents / 100
  else if (cents != null) {
    const n = Number(cents)
    if (Number.isFinite(n)) mpCampaignbudget = n / 100
  }
  const versionNumber =
    publishedVersion != null
      ? Number(
          publishedVersion.version_number ??
            (publishedVersion as { versionNumber?: unknown }).versionNumber ??
            0
        )
      : 0
  const created = createdAtMs(api.created_at)
  return {
    id: api.id,
    mba_number: api.mba_number,
    mp_client_name: api.mp_client_name ?? "",
    mp_campaignname: api.campaign_name ?? "",
    campaign_name: api.campaign_name ?? "",
    version_number: Number.isFinite(versionNumber) ? versionNumber : 0,
    campaign_status: api.campaign_status ?? "",
    campaign_start_date:
      typeof api.campaign_start_date === "string"
        ? api.campaign_start_date.slice(0, 10)
        : api.campaign_start_date ?? "",
    campaign_end_date:
      typeof api.campaign_end_date === "string"
        ? api.campaign_end_date.slice(0, 10)
        : api.campaign_end_date ?? "",
    mp_campaignbudget: mpCampaignbudget,
    ...(created != null ? { created_at: created } : {}),
  }
}

function mapVersion(row: Record<string, unknown>): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  return {
    id: api.id,
    mba_number: api.mba_number,
    version_number: api.version_number,
    brand: api.brand ?? null,
    campaign_name: api.campaign_name ?? null,
    campaign_status: api.campaign_status ?? null,
    campaign_start_date:
      typeof api.campaign_start_date === "string"
        ? api.campaign_start_date.slice(0, 10)
        : api.campaign_start_date ?? null,
    campaign_end_date:
      typeof api.campaign_end_date === "string"
        ? api.campaign_end_date.slice(0, 10)
        : api.campaign_end_date ?? null,
  }
}

function slimXanoVersion(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    mba_number: row.mba_number,
    version_number: row.version_number,
    brand: row.brand ?? null,
    campaign_name: row.campaign_name ?? null,
    campaign_status: row.campaign_status ?? null,
    campaign_start_date:
      typeof row.campaign_start_date === "string"
        ? row.campaign_start_date.slice(0, 10)
        : row.campaign_start_date ?? null,
    campaign_end_date:
      typeof row.campaign_end_date === "string"
        ? row.campaign_end_date.slice(0, 10)
        : row.campaign_end_date ?? null,
  }
}

function versionDuplicateNaturalKey(row: Record<string, unknown>): string | null {
  const mba = String(row.mba_number ?? "")
    .trim()
    .toLowerCase()
  const vn = row.version_number
  if (!mba || vn == null || String(vn).trim() === "") return null
  return `mba_vn:${mba}::${String(vn).trim()}`
}

async function fetchXanoMasters(): Promise<Record<string, unknown>[]> {
  for (const endpoint of ["media_plan_master", "media_plans_master"] as const) {
    try {
      const url = xanoUrl(endpoint, [...MEDIA_PLANS_KEYS])
      const raw = await fetchAllXanoPages(url, {}, `SMOKE_${endpoint}`, 200, 50)
      return (raw ?? []).filter(
        (r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r)
      )
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) continue
      throw err
    }
  }
  return []
}

async function main() {
  loadEnvLocal()
  __resetShadowDiffStoreForTests()

  const db = getDb()
  const [xanoMasters, xanoVersionsRaw, xanoOrphansRes, pgMasters, pgVersions, pgOrphans] =
    await Promise.all([
      fetchXanoMasters(),
      fetchAllXanoPages(
        xanoUrl("media_plan_versions", [...MEDIA_PLANS_KEYS]),
        {},
        "SMOKE_VERSIONS",
        200,
        50
      ),
      fetch(xanoUrl("pacing_orphan_fixes", [...MEDIA_PLANS_KEYS]), {
        headers: { Accept: "application/json", ...xanoAuthHeader() },
      }).then(async (r) => {
        if (!r.ok) throw new Error(`orphan_fixes GET ${r.status}`)
        const body = await r.json()
        return Array.isArray(body) ? body : body?.data ?? []
      }),
      db.select().from(schema.mediaPlanMasters),
      db.select().from(schema.mediaPlanVersions),
      db.select().from(schema.pacingOrphanFixes),
    ])

  const versionById = new Map(
    pgVersions.map((v) => [v.id, v as Record<string, unknown>] as const)
  )
  const pgMastersMapped = pgMasters.map((m) => {
    const row = m as Record<string, unknown>
    const pubId = row.publishedVersionId ?? row.published_version_id
    const published =
      pubId != null && Number.isFinite(Number(pubId))
        ? versionById.get(Number(pubId)) ?? null
        : null
    const publishedApi = published
      ? coerceNumericStringsToNumbers(toApiRow(published))
      : null
    return mapMaster(row, publishedApi)
  })

  const xanoVersions = (xanoVersionsRaw ?? [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map(slimXanoVersion)
  const pgVersionsMapped = pgVersions.map((v) => mapVersion(v as Record<string, unknown>))

  const xanoOrphans = (Array.isArray(xanoOrphansRes) ? xanoOrphansRes : []).filter(
    (r): r is Record<string, unknown> => !!r && typeof r === "object"
  )
  const pgOrphansMapped = pgOrphans.map((r) =>
    coerceNumericStringsToNumbers(toApiRow(r as Record<string, unknown>))
  )

  // Slim Xano masters to pacing keys for fair postgresKeysOnly compare.
  const xanoMastersSlim = xanoMasters.map((r) => ({
    id: r.id,
    mba_number: r.mba_number,
    mp_client_name: r.mp_client_name ?? "",
    mp_campaignname: r.mp_campaignname ?? r.campaign_name ?? "",
    campaign_name: r.mp_campaignname ?? r.campaign_name ?? "",
    version_number: r.version_number,
    campaign_status: r.campaign_status ?? "",
    campaign_start_date:
      typeof r.campaign_start_date === "string"
        ? r.campaign_start_date.slice(0, 10)
        : r.campaign_start_date ?? "",
    campaign_end_date:
      typeof r.campaign_end_date === "string"
        ? r.campaign_end_date.slice(0, 10)
        : r.campaign_end_date ?? "",
    mp_campaignbudget: Number(r.mp_campaignbudget ?? r.campaign_budget ?? 0) || 0,
    ...(typeof r.created_at === "number" ? { created_at: r.created_at } : {}),
  }))

  const masterEvent = compareReferenceRows("media_plan_master", xanoMastersSlim, pgMastersMapped, {
    domain: DOMAIN,
    postgresKeysOnly: true,
  })
  recordShadowDiff(masterEvent)

  const versionEvent = compareReferenceRows("media_plan_versions", xanoVersions, pgVersionsMapped, {
    domain: DOMAIN,
    postgresKeysOnly: true,
    financeDuplicateClass: true,
    duplicateNaturalKey: versionDuplicateNaturalKey,
  })
  recordShadowDiff(versionEvent)

  const orphanEvent = compareReferenceRows("pacing_orphan_fixes", xanoOrphans, pgOrphansMapped, {
    domain: DOMAIN,
    postgresKeysOnly: true,
  })
  recordShadowDiff(orphanEvent)

  const summary = summarizeShadowDiffs(60_000)
  const pacing = summary.byDomain.find((d) => d.domain === DOMAIN)

  console.log(
    JSON.stringify(
      {
        counts: {
          media_plan_master: { xano: xanoMastersSlim.length, pg: pgMastersMapped.length },
          media_plan_versions: { xano: xanoVersions.length, pg: pgVersionsMapped.length },
          pacing_orphan_fixes: { xano: xanoOrphans.length, pg: pgOrphansMapped.length },
        },
        events: {
          media_plan_master: {
            missingInPostgres: masterEvent.missingInPostgres.length,
            missingInXano: masterEvent.missingInXano.length,
            fieldDiffRows: masterEvent.fieldDiffs.length,
            sampleFieldDiffs: masterEvent.fieldDiffs.slice(0, 3),
          },
          media_plan_versions: {
            missingInPostgres: versionEvent.missingInPostgres.length,
            missingInXano: versionEvent.missingInXano.length,
            duplicateClass: versionEvent.duplicateClassMissingInPostgres?.length ?? 0,
            fieldDiffRows: versionEvent.fieldDiffs.length,
            diffClass: versionEvent.diffClass ?? null,
            sampleFieldDiffs: versionEvent.fieldDiffs.slice(0, 3),
          },
          pacing_orphan_fixes: {
            missingInPostgres: orphanEvent.missingInPostgres.length,
            missingInXano: orphanEvent.missingInXano.length,
            fieldDiffRows: orphanEvent.fieldDiffs.length,
          },
        },
        byDomain: pacing ?? null,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
