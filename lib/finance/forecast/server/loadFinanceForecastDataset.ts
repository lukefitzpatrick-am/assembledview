import axios from "axios"
import { slugifyClientNameForUrl, getClientDisplayName } from "@/lib/clients/slug"
import { financeClientNamesMatch, normalizeFinanceClientName } from "@/lib/finance/utils"
import { buildFinanceForecastDataset } from "@/lib/finance/forecast/buildFinanceForecastDataset"
import type {
  FinanceForecastClientInput,
  FinanceForecastDataset,
  FinanceForecastMediaPlanVersionInput,
  FinanceForecastPublisherInput,
  FinanceForecastScenario,
} from "@/lib/types/financeForecast"
import { xanoUrl } from "@/lib/api/xano"
import { stabilizeFinanceForecastDataset } from "./stabilizeFinanceForecastDataset"
import { redactForecastRowDebug } from "./redactForecastDebug"

const MEDIA_BASE_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

export interface LoadFinanceForecastDatasetOptions {
  financialYearStartYear: number
  scenario: FinanceForecastScenario
  /** Optional UI filter: client slug, id, or display name substring. */
  clientFilter?: string
  /** Case-insensitive match on MBA, campaign name, client name on versions. */
  searchText?: string
  /**
   * When non-null, only versions/clients whose display-name slug is in this set are included.
   * Pass `null` for no tenant restriction (admin / manager without claim scoping).
   */
  allowedClientSlugs: Set<string> | null
  /** When false, `FinanceForecastLine.debug` is stripped after build. */
  includeRowDebug: boolean
}

export interface LoadFinanceForecastDatasetResult {
  dataset: FinanceForecastDataset
  meta: {
    financial_year_start_year: number
    scenario: FinanceForecastScenario
    raw_version_count: number
    filtered_version_count: number
    client_scope: "all" | "tenant_slugs"
    include_row_debug: boolean
  }
}

const RAW_CACHE_TTL_MS = 30_000
const DATASET_CACHE_TTL_MS = 20_000

type FinanceForecastRawPayload = {
  versions: FinanceForecastMediaPlanVersionInput[]
  clients: FinanceForecastClientInput[]
  publishers: FinanceForecastPublisherInput[]
}

let rawCache:
  | {
      expiresAt: number
      value: FinanceForecastRawPayload
    }
  | null = null
let rawInFlight: Promise<FinanceForecastRawPayload> | null = null

const datasetCache = new Map<
  string,
  {
    expiresAt: number
    value: LoadFinanceForecastDatasetResult
  }
>()
const datasetInFlight = new Map<string, Promise<LoadFinanceForecastDatasetResult>>()

function unwrapArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>
    if (Array.isArray(p.data)) return p.data
    if (Array.isArray(p.items)) return p.items
  }
  return []
}

function normalizeScenario(raw: string | null): FinanceForecastScenario | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (s === "confirmed" || s === "confirmed_plus_probable") return s
  return null
}

/**
 * Single batched Xano read for Finance Forecast (versions + clients + publishers).
 * No Next.js or Auth imports — safe to unit-test with mocks.
 */
export async function fetchFinanceForecastRawFromXano(): Promise<{
  versions: FinanceForecastMediaPlanVersionInput[]
  clients: FinanceForecastClientInput[]
  publishers: FinanceForecastPublisherInput[]
}> {
  const now = Date.now()
  if (rawCache && rawCache.expiresAt > now) return rawCache.value
  if (rawInFlight) return rawInFlight

  rawInFlight = fetchFinanceForecastRawFromXanoUncached()
    .then((value) => {
      rawCache = { expiresAt: Date.now() + RAW_CACHE_TTL_MS, value }
      return value
    })
    .finally(() => {
      rawInFlight = null
    })

  return rawInFlight
}

async function fetchFinanceForecastRawFromXanoUncached(): Promise<{
  versions: FinanceForecastMediaPlanVersionInput[]
  clients: FinanceForecastClientInput[]
  publishers: FinanceForecastPublisherInput[]
}> {
  const versionsUrl = xanoUrl("media_plan_versions", MEDIA_BASE_KEYS as unknown as string[])
  const clientsUrl = xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL")
  const publishersUrl = xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL")

  const [versionsRes, clientsRes, publishersRes] = await Promise.all([
    axios.get(versionsUrl).catch(() => ({ data: [] })),
    axios.get(clientsUrl).catch(() => ({ data: [] })),
    axios.get(publishersUrl).catch(() => ({ data: [] })),
  ])

  const versions = unwrapArray(versionsRes.data) as FinanceForecastMediaPlanVersionInput[]
  const clients = unwrapArray(clientsRes.data) as FinanceForecastClientInput[]
  const publishers = unwrapArray(publishersRes.data) as FinanceForecastPublisherInput[]

  return { versions, clients, publishers }
}

function datasetCacheKey(options: LoadFinanceForecastDatasetOptions): string {
  const allowed = options.allowedClientSlugs
    ? [...options.allowedClientSlugs].sort().join(",")
    : "__all__"
  return JSON.stringify({
    fy: options.financialYearStartYear,
    scenario: options.scenario,
    clientFilter: options.clientFilter?.trim().toLowerCase() ?? "",
    searchText: options.searchText?.trim().toLowerCase() ?? "",
    allowedClientSlugs: allowed,
    includeRowDebug: options.includeRowDebug,
  })
}

function clientRowSlug(row: FinanceForecastClientInput): string {
  return slugifyClientNameForUrl(getClientDisplayName(row))
}

function versionClientSlug(v: FinanceForecastMediaPlanVersionInput): string {
  const name = String(v.mp_client_name ?? v.campaign_name ?? "").trim()
  return slugifyClientNameForUrl(name || "unknown")
}

function filterVersionsByTenant(
  versions: FinanceForecastMediaPlanVersionInput[],
  allowed: Set<string> | null
): FinanceForecastMediaPlanVersionInput[] {
  if (!allowed || allowed.size === 0) return versions
  return versions.filter((v) => allowed.has(versionClientSlug(v)))
}

function filterClientsByTenant(
  clients: FinanceForecastClientInput[],
  allowed: Set<string> | null
): FinanceForecastClientInput[] {
  if (!allowed || allowed.size === 0) return clients
  return clients.filter((c) => {
    const slug = clientRowSlug(c)
    return allowed.has(slug)
  })
}

function filterVersionsByClientParam(
  versions: FinanceForecastMediaPlanVersionInput[],
  clients: FinanceForecastClientInput[],
  clientFilter: string | undefined
): FinanceForecastMediaPlanVersionInput[] {
  if (!clientFilter?.trim()) return versions
  const needle = clientFilter.trim()

  const normalizedNameHits = new Set<string>()
  for (const c of clients) {
    const id = c.id != null ? String(c.id) : ""
    if (id && id === needle) {
      normalizedNameHits.add(normalizeFinanceClientName(getClientDisplayName(c)))
    }
    const slug = clientRowSlug(c)
    if (slug && (slug === needle.toLowerCase() || slug === slugifyClientNameForUrl(needle))) {
      normalizedNameHits.add(normalizeFinanceClientName(getClientDisplayName(c)))
    }
    if (financeClientNamesMatch(getClientDisplayName(c), needle)) {
      normalizedNameHits.add(normalizeFinanceClientName(getClientDisplayName(c)))
    }
  }

  return versions.filter((v) => {
    const name = String(v.mp_client_name ?? "").trim()
    const vSlug = versionClientSlug(v)
    if (vSlug === needle.toLowerCase() || vSlug === slugifyClientNameForUrl(needle)) return true
    if (financeClientNamesMatch(name, needle)) return true
    const nn = normalizeFinanceClientName(name)
    return nn && normalizedNameHits.has(nn)
  })
}

function filterVersionsBySearch(
  versions: FinanceForecastMediaPlanVersionInput[],
  searchText: string | undefined
): FinanceForecastMediaPlanVersionInput[] {
  const q = searchText?.trim().toLowerCase()
  if (!q) return versions
  return versions.filter((v) => {
    const parts = [v.mba_number, v.campaign_name, v.mp_client_name, v.campaign_id, v.po_number].map((x) =>
      String(x ?? "").toLowerCase()
    )
    return parts.some((p) => p.includes(q))
  })
}

/**
 * End-to-end: fetch Xano → tenant/UI filters → `buildFinanceForecastDataset` → stable sort → optional debug redaction.
 */
export async function loadFinanceForecastDataset(
  options: LoadFinanceForecastDatasetOptions
): Promise<LoadFinanceForecastDatasetResult> {
  const now = Date.now()
  const key = datasetCacheKey(options)
  const cached = datasetCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const existingInFlight = datasetInFlight.get(key)
  if (existingInFlight) {
    return existingInFlight
  }

  const computePromise = (async (): Promise<LoadFinanceForecastDatasetResult> => {
    const { versions: rawVersions, clients: rawClients, publishers } = await fetchFinanceForecastRawFromXano()

    let versions = filterVersionsByTenant(rawVersions, options.allowedClientSlugs)
    let clients = filterClientsByTenant(rawClients, options.allowedClientSlugs)

    versions = filterVersionsByClientParam(versions, rawClients, options.clientFilter)
    versions = filterVersionsBySearch(versions, options.searchText)

    const datasetRaw = buildFinanceForecastDataset({
      media_plan_versions: versions,
      clients,
      publishers,
      financial_year_start_year: options.financialYearStartYear,
      scenario: options.scenario,
    })

    let dataset = stabilizeFinanceForecastDataset(datasetRaw)

    if (!options.includeRowDebug) {
      dataset = redactForecastRowDebug(dataset)
    }

    const client_scope: LoadFinanceForecastDatasetResult["meta"]["client_scope"] =
      options.allowedClientSlugs === null ? "all" : "tenant_slugs"

    const result: LoadFinanceForecastDatasetResult = {
      dataset,
      meta: {
        financial_year_start_year: options.financialYearStartYear,
        scenario: options.scenario,
        raw_version_count: rawVersions.length,
        filtered_version_count: versions.length,
        client_scope,
        include_row_debug: options.includeRowDebug,
      },
    }
    datasetCache.set(key, { expiresAt: Date.now() + DATASET_CACHE_TTL_MS, value: result })
    return result
  })()

  datasetInFlight.set(key, computePromise)
  try {
    return await computePromise
  } finally {
    datasetInFlight.delete(key)
  }
}

export { normalizeScenario }
