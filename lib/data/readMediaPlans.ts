import "server-only"

import { and, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm"
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

/**
 * Prefixes the SQL with an `av:<name>` tag so pg_stat_statements can tell plan
 * readers apart. `sql.raw` keeps the name in the statement text; a bound value
 * becomes `$1` and the normalised query drops it. Drizzle's postgres-js session
 * sends the text through `client.unsafe`, which forces `prepare: false`.
 */
function labelPlanQuery<Q>(query: Q, name: string): Q {
  const q = query as Q & { getSQL(): SQL }
  const render = q.getSQL.bind(q)
  q.getSQL = () => sql`${sql.raw(`/* av:${name} */`)} ${render()}`
  return query
}

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
 * Version columns the master resolvers actually read.
 *
 * From the pointer target (`published` / `publishedApi`):
 * - `publishedAt` / `published_at` — `publishedVersionIfStamped` → `isVersionPublished`
 * - `versionNumber` / `version_number` — stamped watermark inside `mapPlanMasterFromPostgres`
 * `toApiRow` renames every key it is given; `coerceNumericStringsToNumbers` coerces
 * numeric strings on every key it is given. Neither reads a further version column.
 *
 * From every version row (published or not), for the id join and the max watermark:
 * - `id`, `masterId` / `master_id`, `versionNumber` / `version_number`
 *
 * `legacy_schedules` and the rest of the version payload are not read here.
 * Full payloads stay on `fetchPlanVersionsFromPostgres`.
 */
export const PLAN_MASTER_VERSION_META_COLUMNS = {
  id: schema.mediaPlanVersions.id,
  masterId: schema.mediaPlanVersions.masterId,
  versionNumber: schema.mediaPlanVersions.versionNumber,
  publishedAt: schema.mediaPlanVersions.publishedAt,
} as const

/**
 * Full master shape for plan loaders.
 * version_number: COALESCE(published-stamped, max(vn), 0) —
 * null pointer or pointer→unpublished (`published_at IS NULL`) both fall back to max(vn).
 * Published identity stays `published_version_id` (the pointer). Max is only the
 * watermark fallback when that pointer is missing or unstamped.
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

/**
 * Map already-loaded master + version rows. Version rows may be full payloads
 * or {@link PLAN_MASTER_VERSION_META_COLUMNS} only — both produce the same masters.
 */
export function mapPlanMastersFromLoadedRows(
  masters: readonly Record<string, unknown>[],
  versions: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const versionById = new Map(versions.map((v) => [v.id, v]))
  const maxVnByMasterId = new Map<number, number>()
  for (const v of versions) {
    const masterId = Number(v.masterId ?? v.master_id)
    const vn = Number(v.versionNumber ?? v.version_number)
    if (!Number.isFinite(masterId) || !Number.isFinite(vn)) continue
    const prev = maxVnByMasterId.get(masterId)
    if (prev == null || vn > prev) maxVnByMasterId.set(masterId, vn)
  }
  return masters.map((row) => {
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

function masterMbaKey(row: Record<string, unknown>): string {
  return normaliseMba(row.mbaNumber ?? row.mba_number)
}

/**
 * One MBA: masters whose `mba_number` matches case-insensitively, then only
 * those masters' versions. Same mapped shape as picking that MBA out of
 * {@link mapPlanMastersFromLoadedRows}.
 */
export function mapPlanMasterByMbaFromLoadedRows(
  masters: readonly Record<string, unknown>[],
  versions: readonly Record<string, unknown>[],
  mbaNumber: string,
): Record<string, unknown> | null {
  const target = normaliseMba(mbaNumber)
  const matchedMasters = masters.filter((row) => masterMbaKey(row) === target)
  if (matchedMasters.length === 0) return null
  const masterIds = new Set(
    matchedMasters.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)),
  )
  const matchedVersions = versions.filter((row) =>
    masterIds.has(Number(row.masterId ?? row.master_id)),
  )
  return (
    mapPlanMastersFromLoadedRows(matchedMasters, matchedVersions).find(
      (row) => normaliseMba(row.mba_number) === target,
    ) ?? null
  )
}

export async function fetchPlanMastersFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const [masters, versions] = await Promise.all([
    labelPlanQuery(db.select().from(schema.mediaPlanMasters), "readPlanMasters"),
    labelPlanQuery(
      db.select(PLAN_MASTER_VERSION_META_COLUMNS).from(schema.mediaPlanVersions),
      "readPlanMasters",
    ),
  ])
  return mapPlanMastersFromLoadedRows(
    masters as Record<string, unknown>[],
    versions as Record<string, unknown>[],
  )
}

export async function fetchPlanMasterByMbaFromPostgres(
  mbaNumber: string
): Promise<Record<string, unknown> | null> {
  const db = getDb()
  const target = normaliseMba(mbaNumber)
  const masters = await labelPlanQuery(
    db
      .select()
      .from(schema.mediaPlanMasters)
      .where(sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${target}`),
    "readPlanMasterByMba",
  )
  if (masters.length === 0) return null
  const masterIds = masters.map((row) => row.id).filter((id) => Number.isFinite(id))
  const versions =
    masterIds.length === 0
      ? []
      : await labelPlanQuery(
          db
            .select(PLAN_MASTER_VERSION_META_COLUMNS)
            .from(schema.mediaPlanVersions)
            .where(inArray(schema.mediaPlanVersions.masterId, masterIds)),
          "readPlanMasterByMba",
        )
  return mapPlanMasterByMbaFromLoadedRows(
    masters as Record<string, unknown>[],
    versions as Record<string, unknown>[],
    mbaNumber,
  )
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

/** Mapper inputs except `legacy_schedules`. List/cache reads omit the blob. */
function planVersionColumns(includeSchedules: boolean) {
  const v = schema.mediaPlanVersions
  const columns = {
    id: v.id,
    createdAt: v.createdAt,
    masterId: v.masterId,
    versionNumber: v.versionNumber,
    mbaNumber: v.mbaNumber,
    campaignName: v.campaignName,
    campaignStatus: v.campaignStatus,
    campaignStartDate: v.campaignStartDate,
    campaignEndDate: v.campaignEndDate,
    brand: v.brand,
    clientContact: v.clientContact,
    poNumber: v.poNumber,
    campaignBudgetCents: v.campaignBudgetCents,
    fixedFee: v.fixedFee,
    channelFlags: v.channelFlags,
    approvedSlice: v.approvedSlice,
    mbaScope: v.mbaScope,
    snapshotChecksum: v.snapshotChecksum,
    publishedAt: v.publishedAt,
    publishedBy: v.publishedBy,
    miResolution: v.miResolution,
    mediaPlanFile: v.mediaPlanFile,
    mbaPdfFile: v.mbaPdfFile,
    aaMediaPlanFile: v.aaMediaPlanFile,
  }
  if (!includeSchedules) return columns
  return { ...columns, legacySchedules: v.legacySchedules }
}

function mapVersionRows(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((row) => mapPlanVersionFromPostgres(row))
}

function mbaKeys(mbaNumbers: readonly string[]): string[] {
  return [...new Set(mbaNumbers.map(normaliseMba).filter((key) => key.length > 0))]
}

export type ReadPlanVersionsForMbasOptions = {
  /** Restrict to rows with `published_at` set. */
  publishedOnly?: boolean
  /** Select `legacy_schedules`. Off unless the caller reads billing or delivery schedules. */
  includeSchedules?: boolean
}

/**
 * Versions for a set of MBAs. `lower(mba_number) IN (...)`.
 * Empty input returns [] and does not query.
 */
export async function readPlanVersionsForMbas(
  mbaNumbers: readonly string[],
  options?: ReadPlanVersionsForMbasOptions,
): Promise<Record<string, unknown>[]> {
  const keys = mbaKeys(mbaNumbers)
  if (keys.length === 0) return []
  const db = getDb()
  const v = schema.mediaPlanVersions
  const mbaMatch = sql`lower(${v.mbaNumber}) in (${sql.join(
    keys.map((key) => sql`${key}`),
    sql`, `,
  )})`
  const where = options?.publishedOnly
    ? and(mbaMatch, isNotNull(v.publishedAt))
    : mbaMatch
  const rows = await labelPlanQuery(
    db
      .select(planVersionColumns(options?.includeSchedules === true))
      .from(v)
      .where(where),
    "readPlanVersionsForMbas",
  )
  return mapVersionRows(rows as Record<string, unknown>[])
}

/**
 * One row per master whose `published_version_id` points here and `published_at` is set.
 * Keeps `legacy_schedules` (planned-to-date reads `deliverySchedule`).
 */
export async function readPublishedPointerPlanVersions(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const v = schema.mediaPlanVersions
  const masters = schema.mediaPlanMasters
  const rows = await labelPlanQuery(
    db
      .select()
      .from(v)
      .where(
        and(
          isNotNull(v.publishedAt),
          sql`${v.id} in (
            select ${masters.publishedVersionId}
            from ${masters}
            where ${masters.publishedVersionId} is not null
          )`,
        ),
      ),
    "readPublishedPointerPlanVersions",
  )
  return mapVersionRows(rows as Record<string, unknown>[])
}

/**
 * Published rows, plus approved/booked versions whose campaign dates contain `asOfDate`.
 * Keeps `legacy_schedules` (portfolio expected-spend reads both schedules).
 * Live uses the version row's own status and dates, the same window as `isLiveCampaignStatus`.
 */
export async function readPublishedOrLivePlanVersions(
  asOfDate: string,
): Promise<Record<string, unknown>[]> {
  const asOf = String(asOfDate ?? "").trim().slice(0, 10)
  const db = getDb()
  const v = schema.mediaPlanVersions
  const rows = await labelPlanQuery(
    db
      .select()
      .from(v)
      .where(
        or(
          isNotNull(v.publishedAt),
          and(
            sql`lower(trim(${v.campaignStatus})) in ('approved', 'booked')`,
            sql`${v.campaignStartDate} <= ${asOf}::date`,
            sql`${v.campaignEndDate} >= ${asOf}::date`,
          ),
        ),
      ),
    "readPublishedOrLivePlanVersions",
  )
  return mapVersionRows(rows as Record<string, unknown>[])
}

/** Every version, mapped, without `legacy_schedules`. List cache strips schedules anyway. */
export async function readPlanVersionsWithoutSchedules(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await labelPlanQuery(
    db.select(planVersionColumns(false)).from(schema.mediaPlanVersions),
    "readPlanVersionsWithoutSchedules",
  )
  return mapVersionRows(rows as Record<string, unknown>[])
}

export async function fetchPlanVersionsFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await labelPlanQuery(
    db.select().from(schema.mediaPlanVersions),
    "readPlanVersions",
  )
  return rows.map((row) => mapPlanVersionFromPostgres(row as Record<string, unknown>))
}

export async function fetchPlanVersionsByMbaFromPostgres(
  mbaNumber: string
): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await labelPlanQuery(
    db
      .select()
      .from(schema.mediaPlanVersions)
      .where(sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(mbaNumber)}`),
    "readPlanVersionsByMba",
  )
  return rows.map((row) => mapPlanVersionFromPostgres(row as Record<string, unknown>))
}

export async function fetchPlanVersionByMbaAndNumberFromPostgres(
  mbaNumber: string,
  versionNumber: number
): Promise<Record<string, unknown> | null> {
  const db = getDb()
  const rows = await labelPlanQuery(
    db
      .select()
      .from(schema.mediaPlanVersions)
      .where(
        and(
          sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(mbaNumber)}`,
          eq(schema.mediaPlanVersions.versionNumber, versionNumber)
        )
      )
      .limit(1),
    "readPlanVersionByMbaAndNumber",
  )
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
  const versions = await labelPlanQuery(
    db
      .select()
      .from(schema.mediaPlanVersions)
      .where(
        and(
          sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(mbaNumber)}`,
          eq(schema.mediaPlanVersions.versionNumber, versionNumber)
        )
      )
      .limit(1),
    "resolveVersionContext",
  )
  const version = versions[0]
  if (!version) return null

  const masters = await labelPlanQuery(
    db
      .select()
      .from(schema.mediaPlanMasters)
      .where(eq(schema.mediaPlanMasters.id, version.masterId))
      .limit(1),
    "resolveVersionContext",
  )
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
  const rows = await labelPlanQuery(
    db
      .select()
      .from(schema.lineItems)
      .where(
        and(
          eq(schema.lineItems.versionId, ctx.versionId),
          eq(schema.lineItems.channel, channel)
        )
      ),
    "readChannelLineItems",
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
