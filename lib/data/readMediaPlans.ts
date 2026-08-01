import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { type LineChannel } from "@/db/schema"
import { getDb, schema } from "@/db"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import {
  parseXanoListPayload,
  xanoUrl,
} from "@/lib/api/xano"
import { getDataBackendFor } from "@/lib/data/backend"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { compareReferenceRows, recordShadowDiff } from "@/lib/data/shadowDiff"
import { sortLineItemsByLineItemNumber } from "@/lib/mediaplan/lineItemIds"
import {
  CHANNEL_ENDPOINT_TO_CHANNEL,
  PLANS_DUPLICATE_CLASS_MBAS,
  mapLineItemFromPostgres,
  normalizeLineItemForCompare,
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

const DOMAIN = "plans" as const

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

function asRecordList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === "object" && !Array.isArray(row)
    )
  }
  return parseXanoListPayload(body) as Record<string, unknown>[]
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

function lineItemDuplicateNaturalKey(row: Record<string, unknown>): string | null {
  const mba = normaliseMba(row.mba_number)
  const line = String(row.line_item_id ?? "").trim()
  const vn =
    row.mp_plannumber ?? row.version_number ?? row.media_plan_version ?? ""
  if (!mba || !line) return null
  return `plans:${mba}::${String(vn).trim()}::${line}`
}

function runPlansShadowCompare(
  table: string,
  xanoBody: unknown,
  postgresRows: Record<string, unknown>[],
  options: {
    financeDuplicateClass?: boolean
    duplicateNaturalKey?: (row: Record<string, unknown>) => string | null
    postgresKeysOnly?: boolean
  } = {}
): void {
  try {
    const event = compareReferenceRows(table, xanoBody, postgresRows, {
      domain: DOMAIN,
      postgresKeysOnly: options.postgresKeysOnly ?? true,
      financeDuplicateClass: options.financeDuplicateClass ?? true,
      duplicateNaturalKey:
        options.duplicateNaturalKey ?? lineItemDuplicateNaturalKey,
    })
    // Tag known-corrupt MBA extras as duplicate-class when classifier missed them.
    if (event.missingInPostgres.length > 0) {
      const xanoRows = asRecordList(xanoBody)
      const byId = new Map<string | number, Record<string, unknown>>()
      for (const r of xanoRows) {
        const id = r.id
        if (typeof id === "number" || (typeof id === "string" && id)) {
          byId.set(id, r)
        }
      }
      const tagged = new Set(event.duplicateClassMissingInPostgres ?? [])
      for (const id of event.missingInPostgres) {
        const row = byId.get(id)
        if (!row) continue
        if (PLANS_DUPLICATE_CLASS_MBAS.has(normaliseMba(row.mba_number))) {
          tagged.add(id)
        }
      }
      if (tagged.size > 0) {
        event.duplicateClassMissingInPostgres = [...tagged]
        const unexpected = event.missingInPostgres.filter((id) => !tagged.has(id))
        event.diffClass =
          unexpected.length === 0 &&
          event.missingInXano.length === 0 &&
          event.fieldDiffs.length === 0
            ? "duplicate-class"
            : "unexpected"
      }
    }
    recordShadowDiff(event)
  } catch (err) {
    console.error("[migration-shadow-diff] compare failed", { domain: DOMAIN, table, err })
  }
}

// --- masters ---

/**
 * Full master shape for plan loaders.
 * version_number: COALESCE(published, max(vn), 0) for null-pointer debris.
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

  let versionNumber = 0
  if (publishedVersion != null) {
    const fromPub = Number(
      publishedVersion.version_number ??
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

/**
 * Dying-at-T6 (fetchAllXanoPages family). Dual-endpoint 404 → [] is Xano
 * discovery fallback, not a Postgres soft-fail. Do not convert for M7 ViewState.
 * @see docs/brain/READ-FAILURE-REGISTER.md
 */
export async function fetchPlanMastersFromXano(): Promise<Record<string, unknown>[]> {
  for (const endpoint of ["media_plan_master", "media_plans_master"] as const) {
    try {
      const url = xanoUrl(endpoint, [...MEDIA_PLANS_KEYS])
      const raw = await fetchAllXanoPages(url, {}, `PLANS_READ_${endpoint}`, 200, 50)
      return asRecordList(raw)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) continue
      throw err
    }
  }
  return []
}

export async function readPlanMasters(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)
  if (backend === "postgres") return fetchPlanMastersFromPostgres()

  const xanoRows = await fetchPlanMastersFromXano()
  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchPlanMastersFromPostgres()
        runPlansShadowCompare("media_plan_master", xanoRows, postgresRows, {
          financeDuplicateClass: false,
          postgresKeysOnly: true,
        })
      } catch (err) {
        console.error("[migration-shadow-diff] plans masters compare failed", err)
      }
    })()
  }
  return xanoRows
}

export async function readPlanMasterByMba(
  mbaNumber: string
): Promise<Record<string, unknown> | null> {
  const backend = getDataBackendFor(DOMAIN)
  if (backend === "postgres") return fetchPlanMasterByMbaFromPostgres(mbaNumber)

  const xanoRows = await fetchPlanMastersFromXano()
  const target = normaliseMba(mbaNumber)
  const xano = xanoRows.find((r) => normaliseMba(r.mba_number) === target) ?? null

  if (backend === "shadow") {
    void (async () => {
      try {
        const pg = await fetchPlanMasterByMbaFromPostgres(mbaNumber)
        runPlansShadowCompare(
          "media_plan_master",
          xano ? [xano] : [],
          pg ? [pg] : [],
          { financeDuplicateClass: false, postgresKeysOnly: true }
        )
      } catch (err) {
        console.error("[migration-shadow-diff] plans master-by-mba compare failed", err)
      }
    })()
  }
  return xano
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

export async function fetchPlanVersionsFromXano(): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("media_plan_versions", [...MEDIA_PLANS_KEYS])
  const raw = await fetchAllXanoPages(url, {}, "PLANS_READ_VERSIONS", 200, 50)
  return asRecordList(raw)
}

function versionDuplicateNaturalKey(row: Record<string, unknown>): string | null {
  const mba = normaliseMba(row.mba_number)
  const vn = row.version_number
  if (!mba || vn == null || String(vn).trim() === "") return null
  return `mba_vn:${mba}::${String(vn).trim()}`
}

export async function readPlanVersions(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)
  if (backend === "postgres") return fetchPlanVersionsFromPostgres()

  const xanoRows = await fetchPlanVersionsFromXano()
  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchPlanVersionsFromPostgres()
        runPlansShadowCompare("media_plan_versions", xanoRows, postgresRows, {
          financeDuplicateClass: true,
          duplicateNaturalKey: versionDuplicateNaturalKey,
          postgresKeysOnly: true,
        })
      } catch (err) {
        console.error("[migration-shadow-diff] plans versions compare failed", err)
      }
    })()
  }
  return xanoRows
}

export async function readPlanVersionsByMba(
  mbaNumber: string
): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)
  if (backend === "postgres") return fetchPlanVersionsByMbaFromPostgres(mbaNumber)

  const url = xanoUrl("media_plan_versions", [...MEDIA_PLANS_KEYS])
  const raw = await fetchAllXanoPages(
    url,
    { mba_number: mbaNumber },
    "PLANS_READ_VERSIONS_MBA",
    100,
    20
  )
  const xanoRows = asRecordList(raw).filter(
    (r) => normaliseMba(r.mba_number) === normaliseMba(mbaNumber)
  )

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchPlanVersionsByMbaFromPostgres(mbaNumber)
        runPlansShadowCompare("media_plan_versions", xanoRows, postgresRows, {
          financeDuplicateClass: true,
          duplicateNaturalKey: versionDuplicateNaturalKey,
          postgresKeysOnly: true,
        })
      } catch (err) {
        console.error("[migration-shadow-diff] plans versions-by-mba compare failed", err)
      }
    })()
  }
  return xanoRows
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

/**
 * Channel line-item list with DATA_BACKEND_PLANS / DATA_BACKEND.
 * Writes (POST/PUT/DELETE) stay on Xano until T4.
 */
export async function readChannelLineItems(
  endpoint: string,
  mbaNumber: string,
  versionNumber: number,
  xanoFetcher: () => Promise<Record<string, unknown>[]>
): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)
  const channel = channelFromEndpoint(endpoint)
  const table = endpoint

  if (backend === "postgres") {
    if (!channel) return []
    return fetchLineItemsFromPostgres(mbaNumber, versionNumber, channel)
  }

  const xanoRows = await xanoFetcher()

  if (backend === "shadow" && channel) {
    void (async () => {
      try {
        const postgresRows = await fetchLineItemsFromPostgres(
          mbaNumber,
          versionNumber,
          channel
        )
        // Match on line_item_id (PG ids ≠ Xano ids).
        const xanoKeyed = xanoRows.map(normalizeLineItemForCompare)
        const pgKeyed = postgresRows.map(normalizeLineItemForCompare)
        runPlansShadowCompare(table, xanoKeyed, pgKeyed, {
          financeDuplicateClass: true,
          duplicateNaturalKey: lineItemDuplicateNaturalKey,
          postgresKeysOnly: true,
        })
      } catch (err) {
        console.error("[migration-shadow-diff] plans line-items compare failed", {
          table,
          mbaNumber,
          versionNumber,
          err,
        })
      }
    })()
  }

  return xanoRows
}

/** One-shot probe for admin migration-diffs / smoke scripts. */
export async function probePlansShadowDiffs(options?: {
  mbaNumbers?: string[]
  channels?: LineChannel[]
}): Promise<void> {
  const mbas = options?.mbaNumbers ?? ["BICAU001", "BICAU002", "golf009"]
  const channels = options?.channels ?? [
    "television",
    "social",
    "search",
    "production",
    "prog_video",
    "digi_display",
  ]

  await readPlanMasters()
  await readPlanVersions()

  for (const mba of mbas) {
    const versions = await fetchPlanVersionsByMbaFromPostgres(mba)
    const published = versions
      .map((v) => Number(v.version_number))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)[0]
    if (published == null) continue

    for (const channel of channels) {
      const endpoint = Object.entries(CHANNEL_ENDPOINT_TO_CHANNEL).find(
        ([, c]) => c === channel
      )?.[0]
      if (!endpoint) continue
      try {
        const url = xanoUrl(endpoint, [...MEDIA_PLANS_KEYS])
        await readChannelLineItems(endpoint, mba, published, async () => {
          const raw = await fetchAllXanoPages(
            url,
            { mba_number: mba, mp_plannumber: published },
            `PLANS_PROBE_${endpoint}`,
            100,
            20
          )
          return asRecordList(raw)
        })
      } catch (err) {
        console.error("[plans-probe] channel failed", { mba, channel, err })
      }
    }
  }
}
