/**
 * Plan C S1-P3 — freeze client fee% + adserv rates per media_plan_version.
 *
 * Xano table `mba_fee_snapshots` is created out-of-band (see field list in
 * module footer / commit notes). All reads/writes soft-fail when the table or
 * endpoint is missing: log + fall back to live feeLoading.
 */

import axios from "axios"
import { getXanoBaseUrl, parseXanoListPayload, xanoAuthHeaderRecord, xanoPostHeaderRecord } from "@/lib/api/xano"
import type { ClientFeeField, FeeLoading } from "@/lib/finance/campaignFinancials.types"

const XANO_TIMEOUT_MS = 15_000
const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

/** Sentinel `media_type` for the one meta row per version. */
export const FEE_SNAPSHOT_META_MEDIA_TYPE = "__meta__"

export const PLANC_FEESNAP_FALLBACK_PREFIX = "[planc-feesnap-fallback]"

/**
 * All ClientFeeField keys the engine / FeeLoading shape uses.
 * Kept in lockstep with `campaignFinancials.types.ts` ClientFeeField.
 */
export const CLIENT_FEE_FIELDS: readonly ClientFeeField[] = [
  "feetelevision",
  "feeradio",
  "feenewspapers",
  "feemagazines",
  "feeooh",
  "feecinema",
  "feedigidisplay",
  "feedigiaudio",
  "feedigivideo",
  "feebvod",
  "feeintegration",
  "feesearch",
  "feesocial",
  "feeprogdisplay",
  "feeprogvideo",
  "feeprogbvod",
  "feeprogaudio",
  "feeprogooh",
  "feecontentcreator",
  "feeinfluencers",
] as const

export type AdservRates = {
  adservvideo?: number
  adservimp?: number
  adservdisplay?: number
  adservaudio?: number
}

export type FeeSnapshotClientSource = {
  feeLoading?: FeeLoading
  adservRates?: AdservRates
  adservvideo?: number
  adservimp?: number
  adservdisplay?: number
  adservaudio?: number
  /** Optional client-level budget-includes-fees provenance (opaque JSON). */
  budgetIncludesFeesMeta?: Record<string, unknown>
  budget_includes_fees_json?: Record<string, unknown> | string
} & Partial<Record<ClientFeeField, number>>

/** Normalised snapshot payload used for writes + rate-change comparison. */
export type FeeSnapshotBundle = {
  feeLoading: FeeLoading
  adservRates: AdservRates
  budgetIncludesFeesMeta: Record<string, unknown>
}

export type FeeSnapshotRow = {
  id?: number | string
  media_plan_version?: number | string
  media_plan_version_id?: number | string
  media_type?: string | null
  fee_pct?: number | null
  adserv_rates_json?: string | Record<string, unknown> | null
  budget_includes_fees_json?: string | Record<string, unknown> | null
}

export type FeeRatesChangedNotice = {
  previousVersionId: string | number
  previousVersionNumber?: number | string | null
  changedFeeFields: ClientFeeField[]
  adservChanged: boolean
  budgetIncludesFeesChanged: boolean
}

export type FeeSnapshotTransport = {
  listByVersion(versionId: string | number): Promise<FeeSnapshotRow[]>
  create(row: Record<string, unknown>): Promise<void>
}

let transportOverride: FeeSnapshotTransport | null = null

export function setFeeSnapshotTransportForTests(transport: FeeSnapshotTransport | null): void {
  transportOverride = transport
}

export function createMemoryFeeSnapshotTransport(): FeeSnapshotTransport & {
  rows: FeeSnapshotRow[]
} {
  const rows: FeeSnapshotRow[] = []
  let nextId = 1
  return {
    rows,
    async listByVersion(versionId) {
      const target = String(versionId)
      return rows.filter((r) => versionIdMatches(r, target))
    },
    async create(row) {
      rows.push({
        id: nextId++,
        media_plan_version: row.media_plan_version as number | string,
        media_type: String(row.media_type ?? ""),
        fee_pct:
          typeof row.fee_pct === "number" && Number.isFinite(row.fee_pct)
            ? row.fee_pct
            : row.fee_pct == null
              ? null
              : Number(row.fee_pct),
        adserv_rates_json: (row.adserv_rates_json as FeeSnapshotRow["adserv_rates_json"]) ?? null,
        budget_includes_fees_json:
          (row.budget_includes_fees_json as FeeSnapshotRow["budget_includes_fees_json"]) ?? null,
      })
    },
  }
}

function versionIdMatches(row: FeeSnapshotRow, versionId: string | number): boolean {
  const candidates = [row.media_plan_version, row.media_plan_version_id]
  const target = String(versionId)
  return candidates.some((c) => c != null && String(c) === target)
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw == null) return {}
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return {}
    try {
      const parsed = JSON.parse(t)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function isClientFeeField(value: string): value is ClientFeeField {
  return (CLIENT_FEE_FIELDS as readonly string[]).includes(value)
}

export function normalizeFeeSnapshotClient(
  client: FeeSnapshotClientSource | FeeLoading
): FeeSnapshotBundle {
  const record = (client ?? {}) as FeeSnapshotClientSource
  const feeLoading: FeeLoading = { ...(record.feeLoading ?? {}) }

  for (const field of CLIENT_FEE_FIELDS) {
    const fromTop = finiteNumber(record[field])
    if (fromTop != null) feeLoading[field] = fromTop
  }

  const nestedAdserv = record.adservRates ?? {}
  const adservRates: AdservRates = {}
  const video = finiteNumber(record.adservvideo ?? nestedAdserv.adservvideo)
  const imp = finiteNumber(record.adservimp ?? nestedAdserv.adservimp)
  const display = finiteNumber(record.adservdisplay ?? nestedAdserv.adservdisplay)
  const audio = finiteNumber(record.adservaudio ?? nestedAdserv.adservaudio)
  if (video != null) adservRates.adservvideo = video
  if (imp != null) adservRates.adservimp = imp
  if (display != null) adservRates.adservdisplay = display
  if (audio != null) adservRates.adservaudio = audio

  let budgetIncludesFeesMeta: Record<string, unknown> = {}
  if (record.budgetIncludesFeesMeta && typeof record.budgetIncludesFeesMeta === "object") {
    budgetIncludesFeesMeta = { ...record.budgetIncludesFeesMeta }
  } else if (record.budget_includes_fees_json != null) {
    budgetIncludesFeesMeta = parseJsonObject(record.budget_includes_fees_json)
  }

  return { feeLoading, adservRates, budgetIncludesFeesMeta }
}

/**
 * Build a FeeSnapshotClientSource from a PUT/PATCH body + resolved feeLoading.
 */
export function feeSnapshotClientFromRequestBody(
  data: Record<string, unknown> | null | undefined,
  feeLoading: FeeLoading
): FeeSnapshotClientSource {
  const body = data ?? {}
  const clientObj =
    body.client && typeof body.client === "object" && !Array.isArray(body.client)
      ? (body.client as Record<string, unknown>)
      : {}

  const adservRatesRaw = body.adservRates ?? body.adserv_rates ?? clientObj.adservRates
  const adservRates =
    adservRatesRaw && typeof adservRatesRaw === "object" && !Array.isArray(adservRatesRaw)
      ? (adservRatesRaw as AdservRates)
      : undefined

  const bifMeta =
    body.budgetIncludesFeesMeta ??
    body.budget_includes_fees_meta ??
    clientObj.budgetIncludesFeesMeta

  return {
    feeLoading,
    adservRates,
    adservvideo: finiteNumber(body.adservvideo ?? clientObj.adservvideo),
    adservimp: finiteNumber(body.adservimp ?? clientObj.adservimp),
    adservdisplay: finiteNumber(body.adservdisplay ?? clientObj.adservdisplay),
    adservaudio: finiteNumber(body.adservaudio ?? clientObj.adservaudio),
    budgetIncludesFeesMeta:
      bifMeta && typeof bifMeta === "object" && !Array.isArray(bifMeta)
        ? (bifMeta as Record<string, unknown>)
        : undefined,
  }
}

function rowsToBundle(rows: FeeSnapshotRow[]): FeeSnapshotBundle | null {
  if (!rows.length) return null
  const feeLoading: FeeLoading = {}
  let adservRates: AdservRates = {}
  let budgetIncludesFeesMeta: Record<string, unknown> = {}
  let sawFeeOrMeta = false

  for (const row of rows) {
    const mediaType = String(row.media_type ?? "").trim()
    if (!mediaType) continue
    if (mediaType === FEE_SNAPSHOT_META_MEDIA_TYPE) {
      sawFeeOrMeta = true
      adservRates = {
        ...adservRates,
        ...pickAdservRates(parseJsonObject(row.adserv_rates_json)),
      }
      budgetIncludesFeesMeta = {
        ...budgetIncludesFeesMeta,
        ...parseJsonObject(row.budget_includes_fees_json),
      }
      continue
    }
    if (isClientFeeField(mediaType)) {
      const pct = finiteNumber(row.fee_pct)
      if (pct != null) {
        feeLoading[mediaType] = pct
        sawFeeOrMeta = true
      }
    }
  }

  return sawFeeOrMeta ? { feeLoading, adservRates, budgetIncludesFeesMeta } : null
}

function pickAdservRates(obj: Record<string, unknown>): AdservRates {
  const out: AdservRates = {}
  const video = finiteNumber(obj.adservvideo)
  const imp = finiteNumber(obj.adservimp)
  const display = finiteNumber(obj.adservdisplay)
  const audio = finiteNumber(obj.adservaudio)
  if (video != null) out.adservvideo = video
  if (imp != null) out.adservimp = imp
  if (display != null) out.adservdisplay = display
  if (audio != null) out.adservaudio = audio
  return out
}

function createXanoTransport(baseUrl?: string): FeeSnapshotTransport {
  return {
    async listByVersion(versionId) {
      let resolvedBase = baseUrl
      try {
        resolvedBase ??= getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
      } catch (error) {
        console.warn("[feeSnapshots] base URL unresolved; treating as no snapshot", {
          versionId,
          message: error instanceof Error ? error.message : String(error),
        })
        return []
      }

      try {
        const response = await axios.get(`${resolvedBase}/mba_fee_snapshots`, {
          params: {
            media_plan_version: versionId,
            page: 1,
            per_page: 200,
          },
          headers: xanoAuthHeaderRecord(),
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
        if (response.status === 404) {
          console.warn("[feeSnapshots] GET 404 (table missing?); treating as no snapshot", {
            versionId,
          })
          return []
        }
        if (response.status >= 400) {
          console.warn("[feeSnapshots] GET failed", {
            versionId,
            status: response.status,
            upstream: response.data,
          })
          return []
        }
        const rows = parseXanoListPayload(response.data) as FeeSnapshotRow[]
        return rows.filter((r) => versionIdMatches(r, versionId) || !r.media_plan_version)
      } catch (error) {
        console.warn("[feeSnapshots] GET threw; treating as no snapshot", {
          versionId,
          message: error instanceof Error ? error.message : String(error),
        })
        return []
      }
    },

    async create(row) {
      let resolvedBase = baseUrl
      try {
        resolvedBase ??= getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
      } catch (error) {
        console.warn("[feeSnapshots] POST skipped — base URL unresolved", {
          message: error instanceof Error ? error.message : String(error),
        })
        return
      }

      try {
        const response = await axios.post(`${resolvedBase}/mba_fee_snapshots`, row, {
          headers: xanoPostHeaderRecord(),
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
        if (response.status === 404) {
          console.warn("[feeSnapshots] POST 404 (table missing?); snapshot not written", {
            media_plan_version: row.media_plan_version,
            media_type: row.media_type,
          })
          return
        }
        if (response.status >= 400) {
          console.warn("[feeSnapshots] POST failed", {
            status: response.status,
            upstream: response.data,
            media_plan_version: row.media_plan_version,
            media_type: row.media_type,
          })
        }
      } catch (error) {
        console.warn("[feeSnapshots] POST threw; snapshot not written", {
          media_plan_version: row.media_plan_version,
          media_type: row.media_type,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}

function getTransport(opts?: { baseUrl?: string }): FeeSnapshotTransport {
  return transportOverride ?? createXanoTransport(opts?.baseUrl)
}

/**
 * Read fee rows for a version and return FeeLoading (engine shape), or null
 * when no snapshot exists / table is unavailable.
 */
export async function readFeeSnapshot(
  versionId: string | number,
  opts?: { baseUrl?: string }
): Promise<FeeLoading | null> {
  const bundle = await readFeeSnapshotBundle(versionId, opts)
  return bundle?.feeLoading ?? null
}

export async function readFeeSnapshotBundle(
  versionId: string | number,
  opts?: { baseUrl?: string }
): Promise<FeeSnapshotBundle | null> {
  if (versionId == null || String(versionId).trim() === "") return null
  const rows = await getTransport(opts).listByVersion(versionId)
  return rowsToBundle(rows)
}

export async function hasFeeSnapshot(
  versionId: string | number,
  opts?: { baseUrl?: string }
): Promise<boolean> {
  const bundle = await readFeeSnapshotBundle(versionId, opts)
  return bundle != null
}

/**
 * Write one fee row per ClientFeeField present in feeLoading, plus one meta row
 * with adserv rates + budget-includes-fees JSON.
 */
export async function writeFeeSnapshot(
  versionId: string | number,
  client: FeeSnapshotClientSource | FeeLoading,
  opts?: { baseUrl?: string }
): Promise<FeeSnapshotBundle> {
  const bundle = normalizeFeeSnapshotClient(client)
  const transport = getTransport(opts)
  const versionKey =
    typeof versionId === "number" && Number.isFinite(versionId)
      ? versionId
      : String(versionId).trim()

  for (const field of CLIENT_FEE_FIELDS) {
    const pct = finiteNumber(bundle.feeLoading[field])
    if (pct == null) continue
    await transport.create({
      media_plan_version: versionKey,
      media_type: field,
      fee_pct: pct,
      adserv_rates_json: null,
      budget_includes_fees_json: null,
    })
  }

  await transport.create({
    media_plan_version: versionKey,
    media_type: FEE_SNAPSHOT_META_MEDIA_TYPE,
    fee_pct: null,
    adserv_rates_json: JSON.stringify(bundle.adservRates),
    budget_includes_fees_json: JSON.stringify(bundle.budgetIncludesFeesMeta),
  })

  return bundle
}

/**
 * Write-once: if a snapshot already exists for the version, skip.
 * Used for draft overwrite (first save writes; subsequent draft saves reuse).
 */
export async function writeFeeSnapshotOnce(
  versionId: string | number,
  client: FeeSnapshotClientSource | FeeLoading,
  opts?: { baseUrl?: string }
): Promise<{ wrote: boolean; bundle: FeeSnapshotBundle | null }> {
  const existing = await readFeeSnapshotBundle(versionId, opts)
  if (existing) {
    return { wrote: false, bundle: existing }
  }
  const bundle = await writeFeeSnapshot(versionId, client, opts)
  return { wrote: true, bundle }
}

/**
 * Resolve rates for C1 / authority: snapshot ?? live.
 * Logs `[planc-feesnap-fallback]` once when a version id was supplied but no
 * snapshot exists (legacy versions).
 */
export async function resolveFeeLoadingForVersion(args: {
  versionId?: string | number | null
  liveFeeLoading: FeeLoading
  meta?: { mba_number?: string; version?: string | number }
  baseUrl?: string
  /** When false, suppress the fallback log (caller already logged). Default true. */
  logFallback?: boolean
}): Promise<{
  feeLoading: FeeLoading
  fromSnapshot: boolean
  bundle: FeeSnapshotBundle | null
}> {
  const { versionId, liveFeeLoading, meta, baseUrl } = args
  const logFallback = args.logFallback !== false

  if (versionId == null || String(versionId).trim() === "") {
    return { feeLoading: liveFeeLoading, fromSnapshot: false, bundle: null }
  }

  const bundle = await readFeeSnapshotBundle(versionId, { baseUrl })
  if (bundle) {
    return { feeLoading: bundle.feeLoading, fromSnapshot: true, bundle }
  }

  if (logFallback) {
    console.warn(PLANC_FEESNAP_FALLBACK_PREFIX, {
      mba_number: meta?.mba_number,
      version: meta?.version,
      versionId,
    })
  }

  return { feeLoading: liveFeeLoading, fromSnapshot: false, bundle: null }
}

function sortedFeeEntries(feeLoading: FeeLoading): Array<[ClientFeeField, number]> {
  const out: Array<[ClientFeeField, number]> = []
  for (const field of CLIENT_FEE_FIELDS) {
    const n = finiteNumber(feeLoading[field])
    if (n != null) out.push([field, n])
  }
  return out
}

function adservEqual(a: AdservRates, b: AdservRates): boolean {
  const keys: Array<keyof AdservRates> = [
    "adservvideo",
    "adservimp",
    "adservdisplay",
    "adservaudio",
  ]
  for (const key of keys) {
    const av = finiteNumber(a[key]) ?? null
    const bv = finiteNumber(b[key]) ?? null
    if (av !== bv) return false
  }
  return true
}

function jsonEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * Compare two snapshot bundles; returns notice when any fee/adserv/bif meta differs.
 */
export function buildFeeRatesChangedNotice(args: {
  previousVersionId: string | number
  previousVersionNumber?: number | string | null
  previous: FeeSnapshotBundle | null
  next: FeeSnapshotBundle
}): FeeRatesChangedNotice | null {
  const { previous, next, previousVersionId, previousVersionNumber } = args
  if (!previous) return null

  const changedFeeFields: ClientFeeField[] = []
  const prevMap = new Map(sortedFeeEntries(previous.feeLoading))
  const nextMap = new Map(sortedFeeEntries(next.feeLoading))
  const allFields = new Set<ClientFeeField>([
    ...prevMap.keys(),
    ...nextMap.keys(),
  ])
  for (const field of allFields) {
    const a = prevMap.get(field)
    const b = nextMap.get(field)
    if (a !== b) changedFeeFields.push(field)
  }

  const adservChanged = !adservEqual(previous.adservRates, next.adservRates)
  const budgetIncludesFeesChanged = !jsonEqual(
    previous.budgetIncludesFeesMeta,
    next.budgetIncludesFeesMeta
  )

  if (
    changedFeeFields.length === 0 &&
    !adservChanged &&
    !budgetIncludesFeesChanged
  ) {
    return null
  }

  return {
    previousVersionId,
    previousVersionNumber: previousVersionNumber ?? null,
    changedFeeFields,
    adservChanged,
    budgetIncludesFeesChanged,
  }
}

/*
 * Xano table `mba_fee_snapshots` — exact fields this module expects (1:1):
 *
 * | field                     | type                         | notes |
 * |---------------------------|------------------------------|-------|
 * | id                        | number (auto)                | PK |
 * | media_plan_version        | number                       | FK → media_plan_versions.id (filter/query param) |
 * | media_type                | text                         | ClientFeeField (e.g. feesearch) OR "__meta__" |
 * | fee_pct                   | number | null                | agency fee %; null on meta row |
 * | adserv_rates_json         | text (JSON) | null           | meta only: { adservvideo, adservimp, adservdisplay, adservaudio } |
 * | budget_includes_fees_json | text (JSON) | null           | meta only: opaque client bif provenance |
 * | created_at                | timestamp                    | optional; Xano default ok |
 *
 * Endpoints used: GET /mba_fee_snapshots?media_plan_version=&page=&per_page=
 *                 POST /mba_fee_snapshots
 */
