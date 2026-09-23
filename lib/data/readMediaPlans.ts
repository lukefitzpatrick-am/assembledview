import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { type LineChannel } from "@/db/schema"
import { getDb, schema } from "@/db"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { sortLineItemsByLineItemNumber } from "@/lib/mediaplan/lineItemIds"
import { publishedVersionIfStamped } from "@/lib/mediaplan/publishedVersionGuard"
import {
  CHANNEL_ENDPOINT_TO_CHANNEL,
  mapLineItemFromPostgres,
  type LineItemAssemblyContext,
} from "@/lib/data/planShapes"

export {
  BURSTS_FIELD_AS_BURSTS,
  CHANNEL_ENDPOINT_TO_CHANNEL,
  LINE_ITEM_COMMON_FIELDS,
  PLANS_DUPLICATE_CLASS_MBAS,
  mapLineItemFromPostgres,
  normalizeLineItemForCompare,
  spreadAttrsForChannel,
  type LineItemAssemblyContext,
} from "@/lib/data/planShapes"

function createdAtMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : undefined
  }
  return undefined
}

function normaliseMba(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

function channelFromEndpoint(endpoint: string): LineChannel | null {
  return CHANNEL_ENDPOINT_TO_CHANNEL[endpoint] ?? null
}

// --- masters ---

export { publishedVersionIfStamped }

/**
 * Full master shape for plan loaders.
 * version_number: COALESCE(published-stamped, max(vn), 0) —
 * null pointer or pointer→unpublished (`published_at IS NULL`) both fall back to max(vn).
 */
export function mapPlanMasterFromPostgres(
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

  const stamped = publishedVersionIfStamped(publishedVersion)
  let versionNumber = 0
  if (stamped != null) {
    const fromPub = Number(
      stamped.version_number ??
        (stamped as { versionNumber?: unknown }).versionNumber ??
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
    published_version_id: api.published_version_id ?? null,
    client_id: api.client_id ?? null,
    ...(created != null ? { created_at: created } : {}),
  }
}

export async function fetchPlanMastersFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const [masters, versions] = await Promise.all([
    db.select().from(schema.mediaPlanMasters),
    db.select().from(schema.mediaPlanVersions),
  ])
  const versionById = new Map(versions.map((v) => [v.id, v as Record<string, unknown>]))
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
    const publishedRaw =
      pubId != null && Number.isFinite(Number(pubId))
        ? versionById.get(Number(pubId)) ?? null
        : null
    // Join requires published_at IS NOT NULL — stale pointer ≡ null pointer.
    const published = publishedVersionIfStamped(publishedRaw)
    const publishedApi = published
      ? coerceNumericStringsToNumbers(toApiRow(published))
      : null
    const maxVn =
      published == null && Number.isFinite(masterId)
        ? maxVnByMasterId.get(masterId) ?? null
        : null
    return mapPlanMasterFromPostgres(row, publishedApi, maxVn)
  })
}

export async function fetchPlanMasterByMbaFromPostgres(
  mbaNumber: string
): Promise<Record<string, unknown> | null> {
  const all = await fetchPlanMastersFromPostgres()
  const target = normaliseMba(mbaNumber)
  return all.find((r) => normaliseMba(r.mba_number) === target) ?? null
}

export async function readPlanMasters(): Promise<Record<string, unknown>[]> {
  return fetchPlanMastersFromPostgres()
}

export async function readPlanMasterByMba(
  mbaNumber: string
): Promise<Record<string, unknown> | null> {
  return fetchPlanMasterByMbaFromPostgres(mbaNumber)
}

// --- versions (incl. legacy_schedules blob passthrough) ---

/**
 * Map Postgres version → Xano media_plan_versions shape.
 * Spreads `legacy_schedules.billingSchedule` / `deliverySchedule` to top-level
 * for readers that still consume blobs; expands `channel_flags` to mp_* booleans.
 */
export function mapPlanVersionFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  const cents = api.campaign_budget_cents
  let mpCampaignbudget: number | null = null
  if (typeof cents === "number" && Number.isFinite(cents)) {
    mpCampaignbudget = cents / 100
  } else if (cents != null) {
    const n = Number(cents)
    if (Number.isFinite(n)) mpCampaignbudget = n / 100
  }

  const legacy =
    api.legacy_schedules && typeof api.legacy_schedules === "object"
      ? (api.legacy_schedules as Record<string, unknown>)
      : {}
  const flags =
    api.channel_flags && typeof api.channel_flags === "object"
      ? (api.channel_flags as Record<string, unknown>)
      : {}

  const CHANNEL_FLAG_TO_XANO: Record<string, string> = {
    television: "mp_television",
    radio: "mp_radio",
    cinema: "mp_cinema",
    newspaper: "mp_newspaper",
    magazines: "mp_magazines",
    ooh: "mp_ooh",
    prog_display: "mp_progdisplay",
    prog_video: "mp_progvideo",
    prog_audio: "mp_progaudio",
    prog_bvod: "mp_progbvod",
    prog_ooh: "mp_progooh",
    digi_display: "mp_digidisplay",
    digi_video: "mp_digivideo",
    digi_audio: "mp_digiaudio",
    digi_bvod: "mp_bvod",
    social: "mp_socialmedia",
    search: "mp_search",
    influencers: "mp_influencers",
    integrations: "mp_integration",
    production: "mp_production",
  }

  const flagFields: Record<string, unknown> = {}
  for (const [channel, xanoKey] of Object.entries(CHANNEL_FLAG_TO_XANO)) {
    if (flags[channel] != null) flagFields[xanoKey] = Boolean(flags[channel])
  }

  const created = createdAtMs(api.created_at)
  return {
    id: api.id,
    mba_number: api.mba_number,
    version_number: api.version_number,
    media_plan_master_id: api.master_id,
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
    brand: api.brand ?? null,
    client_contact: api.client_contact ?? null,
    po_number: api.po_number ?? null,
    mp_campaignbudget: mpCampaignbudget,
    fixed_fee: api.fixed_fee ?? null,
    billingSchedule: legacy.billingSchedule ?? null,
    deliverySchedule: legacy.deliverySchedule ?? null,
    media_plan: api.media_plan_file ?? null,
    mba_pdf: api.mba_pdf_file ?? null,
    aa_media_plan: api.aa_media_plan_file ?? null,
    // VC Stage 1 — publication columns (null = unpublished). Do not drop.
    published_at: api.published_at ?? null,
    published_by: api.published_by ?? null,
    /** null = pre-scope legacy version; object = saved MBA scope (full or partial). */
    mba_scope: api.mba_scope ?? null,
    ...flagFields,
    ...(created != null ? { created_at: created } : {}),
  }
}

export async function fetchPlanVersionsFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.mediaPlanVersions)
  return rows.map((row) => mapPlanVersionFromPostgres(row as Record<string, unknown>))
}

export async function fetchPlanVersionsByMbaFromPostgres(
  mbaNumber: string
): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(mbaNumber)}`)
  return rows.map((row) => mapPlanVersionFromPostgres(row as Record<string, unknown>))
}

export async function fetchPlanVersionByMbaAndNumberFromPostgres(
  mbaNumber: string,
  versionNumber: number
): Promise<Record<string, unknown> | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(
      and(
        sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(mbaNumber)}`,
        eq(schema.mediaPlanVersions.versionNumber, versionNumber)
      )
    )
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return mapPlanVersionFromPostgres(row as Record<string, unknown>)
}

export async function readPlanVersions(): Promise<Record<string, unknown>[]> {
  return fetchPlanVersionsFromPostgres()
}

export async function readPlanVersionsByMba(
  mbaNumber: string
): Promise<Record<string, unknown>[]> {
  return fetchPlanVersionsByMbaFromPostgres(mbaNumber)
}

// --- per-channel line items ---

async function resolveVersionContext(
  mbaNumber: string,
  versionNumber: number
): Promise<LineItemAssemblyContext | null> {
  const db = getDb()
  const versions = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(
      and(
        sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(mbaNumber)}`,
        eq(schema.mediaPlanVersions.versionNumber, versionNumber)
      )
    )
    .limit(1)
  const version = versions[0]
  if (!version) return null

  const masters = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, version.masterId))
    .limit(1)
  const master = masters[0]

  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    mbaNumber: version.mbaNumber,
    mpClientName: master?.mpClientName ?? null,
  }
}

/**
 * Load line items for one MBA + version_number + channel from Postgres and
 * reassemble legacy Xano per-channel shape.
 */
export async function fetchLineItemsFromPostgres(
  mbaNumber: string,
  versionNumber: number,
  channel: LineChannel
): Promise<Record<string, unknown>[]> {
  const ctx = await resolveVersionContext(mbaNumber, versionNumber)
  if (!ctx) return []

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.lineItems)
    .where(
      and(
        eq(schema.lineItems.versionId, ctx.versionId),
        eq(schema.lineItems.channel, channel)
      )
    )

  const mapped = rows.map((row) =>
    mapLineItemFromPostgres(row as Record<string, unknown>, ctx)
  )
  return sortLineItemsByLineItemNumber(mapped)
}

export async function fetchLineItemsFromPostgresByEndpoint(
  endpoint: string,
  mbaNumber: string,
  versionNumber: number
): Promise<Record<string, unknown>[]> {
  const channel = channelFromEndpoint(endpoint)
  if (!channel) {
    throw new Error(`Unknown channel endpoint for plans read: ${endpoint}`)
  }
  return fetchLineItemsFromPostgres(mbaNumber, versionNumber, channel)
}

/** Channel line-item list from Postgres `line_items`. */
export async function readChannelLineItems(
  endpoint: string,
  mbaNumber: string,
  versionNumber: number,
  _xanoFetcher?: () => Promise<Record<string, unknown>[]>
): Promise<Record<string, unknown>[]> {
  const channel = channelFromEndpoint(endpoint)
  if (!channel) return []
  return fetchLineItemsFromPostgres(mbaNumber, versionNumber, channel)
}

/** Plans reads are Postgres. Kept so admin migration-diffs still calls a no-op. */
export async function probePlansShadowDiffs(_options?: {
  mbaNumbers?: string[]
  channels?: LineChannel[]
}): Promise<void> {}
