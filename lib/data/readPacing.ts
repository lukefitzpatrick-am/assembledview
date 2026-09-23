import "server-only"

import { getDb, schema } from "@/db"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { readPacingOrphanFixRows } from "@/lib/pacing/admin/pacingOrphanFixes"

/**
 * Pacing-surface reads from Postgres:
 * - `media_plan_masters` / `media_plan_versions` (live campaign crawl)
 * - `pacing_orphan_fixes` (audit rows)
 *
 * Snapshot sync: `LINE_ITEM_SNAPSHOT_SOURCE`.
 */

function createdAtMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : undefined
  }
  return undefined
}

// --- media_plan_master (pacing crawl shape) ---

/**
 * Map Postgres master (+ published version join) → Xano/pacing MediaPlanMaster fields.
 * `campaign_budget_cents` → `mp_campaignbudget` dollars; `version_number` from
 * published version row (watermark). When `published_version_id` is null (debris
 * masters: golf022 / krusty009 / test123001), fall back to
 * `COALESCE(published, max(version_number), 0)` so shadow/postgres never emit a
 * spurious `version_number` diff — does not invent a published pointer.
 */
export function mapPacingMasterFromPostgres(
  master: Record<string, unknown>,
  publishedVersion: Record<string, unknown> | null,
  maxVersionNumber: number | null = null
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(master))
  const cents = api.campaign_budget_cents
  let mpCampaignbudget = 0
  if (typeof cents === "number" && Number.isFinite(cents)) {
    mpCampaignbudget = cents / 100
  } else if (cents != null) {
    const n = Number(cents)
    if (Number.isFinite(n)) mpCampaignbudget = n / 100
  }

  let versionNumber = 0
  if (publishedVersion != null) {
    const fromPub = Number(
      (publishedVersion as { version_number?: unknown; versionNumber?: unknown })
        .version_number ??
        (publishedVersion as { versionNumber?: unknown }).versionNumber ??
        0
    )
    versionNumber = Number.isFinite(fromPub) ? fromPub : 0
  } else if (maxVersionNumber != null && Number.isFinite(maxVersionNumber)) {
    versionNumber = maxVersionNumber
  }

  const created = createdAtMs(api.created_at)

  return {
    id: api.id,
    mba_number: api.mba_number,
    mp_client_name: api.mp_client_name ?? "",
    mp_campaignname: api.campaign_name ?? "",
    campaign_name: api.campaign_name ?? "",
    version_number: versionNumber,
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

export async function fetchPacingMastersFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const [masters, versions] = await Promise.all([
    db.select().from(schema.mediaPlanMasters),
    db.select().from(schema.mediaPlanVersions),
  ])
  const versionById = new Map(
    versions.map((v) => [v.id, v as Record<string, unknown>] as const)
  )
  const maxVnByMasterId = new Map<number, number>()
  for (const v of versions) {
    const row = v as Record<string, unknown>
    const masterId = Number(row.masterId ?? row.master_id)
    const vn = Number(row.versionNumber ?? row.version_number)
    if (!Number.isFinite(masterId) || !Number.isFinite(vn)) continue
    const prev = maxVnByMasterId.get(masterId)
    if (prev == null || vn > prev) maxVnByMasterId.set(masterId, vn)
  }
  return masters.map((m) => {
    const row = m as Record<string, unknown>
    const masterId = Number(row.id)
    const pubId = row.publishedVersionId ?? row.published_version_id
    const published =
      pubId != null && Number.isFinite(Number(pubId))
        ? versionById.get(Number(pubId)) ?? null
        : null
    const publishedApi = published
      ? coerceNumericStringsToNumbers(toApiRow(published))
      : null
    const maxVn =
      published == null && Number.isFinite(masterId)
        ? maxVnByMasterId.get(masterId) ?? null
        : null
    return mapPacingMasterFromPostgres(row, publishedApi, maxVn)
  })
}

/** Masters list for pacing composers (`fetchAllMasters`). Postgres. */
export async function readPacingMasters(): Promise<Record<string, unknown>[]> {
  return fetchPacingMastersFromPostgres()
}

// --- media_plan_versions (pacing crawl) ---

/** Pacing-relevant version fields only (skip legacy blobs / files). */
export function mapPacingVersionFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
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

export async function fetchPacingVersionsFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.mediaPlanVersions)
  return rows.map((row) => mapPacingVersionFromPostgres(row as Record<string, unknown>))
}

/** Versions list for pacing (`fetchCurrentVersionRowsForMasters`). Postgres. */
export async function readPacingVersions(): Promise<Record<string, unknown>[]> {
  return fetchPacingVersionsFromPostgres()
}

// --- pacing_orphan_fixes ---

export async function fetchPacingOrphanFixesFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  return readPacingOrphanFixRows()
}

/** List orphan-fix audit rows from Postgres `pacing_orphan_fixes`. */
export async function readPacingOrphanFixes(): Promise<Record<string, unknown>[]> {
  return fetchPacingOrphanFixesFromPostgres()
}

/** Pacing shadow probe is retired. Postgres is the only read. */
export async function probePacingShadowDiffs(): Promise<void> {}
