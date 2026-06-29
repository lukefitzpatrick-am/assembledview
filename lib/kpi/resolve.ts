import type { PublisherKPI, ClientKPI, CampaignKPI, ResolvedKPIRow } from "./types"
import type { Publisher } from "@/lib/types/publisher"
import { groupLineItemsForKPI } from "./grouping"
import { extractKPIKeys } from "./matching"
import { recalcRow } from "./recalc"
import { mediaTypeMatchesKpiRow } from "./matching"
import { buildPublisherIdToNormNameMap, linePublisherMatchesKpiPublisherField } from "./matching"

export interface ResolveKPIOptions {
  lineItems: any[]
  mediaType: string
  clientName: string
  mbaNumber: string
  versionNumber: number
  campaignName: string
  publisherKPIs: PublisherKPI[]
  clientKPIs: ClientKPI[]
  savedCampaignKPIs: CampaignKPI[]
  /** Used to match `publisher_kpi.publisher` (often id) to line-item platform (display name). */
  publishers?: Publisher[]
}

const METRIC_KEYS = ["ctr", "conversion_rate", "vtr", "frequency"] as const
type MetricKey = (typeof METRIC_KEYS)[number]

type Layer = "saved" | "client" | "publisher"

function normStr(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
}

/** KPI metrics from DB rows — CPV is never used from persistence (derived or manual only). */
function metricsFromRecordNoCpv(
  r: {
    ctr?: unknown
    conversion_rate?: unknown
    vtr?: unknown
    frequency?: unknown
  },
): Record<MetricKey, number | null> {
  const norm = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    ctr: norm(r.ctr),
    conversion_rate: norm(r.conversion_rate),
    vtr: norm(r.vtr),
    frequency: norm(r.frequency),
  }
}

function pickMergedMetric(
  saved: number | null,
  client: number,
  pub: number | null | undefined,
): {
  value: number | null
  layer: Layer | null
} {
  if (saved !== null) return { value: saved, layer: "saved" }
  if (client !== 0) return { value: client, layer: "client" }
  if (pub !== undefined && pub !== null) return { value: pub, layer: "publisher" }
  return { value: null, layer: null }
}

function deriveCpvFromLine(buyType: string, spend: number, deliverables: number): number {
  const bt = buyType.toLowerCase()
  if (!bt.includes("cpv")) return 0
  return deliverables > 0 ? spend / deliverables : 0
}

function resolveSourceFromLayers(
  layersUsed: Set<Layer>,
): ResolvedKPIRow["source"] {
  if (layersUsed.has("saved")) return "saved"
  if (layersUsed.has("client")) return "client"
  if (layersUsed.has("publisher")) return "publisher"
  return "default"
}

export function resolveKPIsForMediaType(opts: ResolveKPIOptions): ResolvedKPIRow[] {
  const { mediaType, clientName, mbaNumber, versionNumber, campaignName } = opts
  const idToNormName = buildPublisherIdToNormNameMap(opts.publishers ?? [])
  const grouped = groupLineItemsForKPI(opts.lineItems, {
    mbaNumber,
    mediaType,
  })

  return grouped.map((item) => {
    const { publisher, bidStrategy, label } = extractKPIKeys(item, mediaType)

    const spend = item.spend
    const deliverables = item.deliverables
    const buyType = item.buyType.toLowerCase()

    const lineItemId = item.lineItemId

    const saved = opts.savedCampaignKPIs.find(
      (k) =>
        mediaTypeMatchesKpiRow(mediaType, k.media_type) &&
        linePublisherMatchesKpiPublisherField(
          publisher,
          k.publisher,
          idToNormName,
        ) &&
        normStr(k.bid_strategy) === bidStrategy,
    )

    const clientMatch = opts.clientKPIs.find(
      (k) =>
        mediaTypeMatchesKpiRow(mediaType, k.media_type) &&
        normStr(k.publisher_name) === publisher &&
        normStr(k.bid_strategy) === bidStrategy,
    )

    const pubMatch = opts.publisherKPIs.find(
      (k) =>
        mediaTypeMatchesKpiRow(mediaType, k.media_type) &&
        linePublisherMatchesKpiPublisherField(
          publisher,
          k.publisher,
          idToNormName,
        ) &&
        normStr(k.bid_strategy) === bidStrategy,
    )

    const campM = saved ? metricsFromRecordNoCpv(saved) : null
    const cliM = clientMatch ? metricsFromRecordNoCpv(clientMatch) : null
    const pubM = pubMatch ? metricsFromRecordNoCpv(pubMatch) : null

    const layersUsed = new Set<Layer>()
    const merged: Record<MetricKey, number | null> = {
      ctr: null,
      conversion_rate: null,
      vtr: null,
      frequency: null,
    }

    for (const key of METRIC_KEYS) {
      const s = campM ? campM[key] : null
      const c = cliM ? (cliM[key] ?? 0) : 0
      const p = pubM ? pubM[key] : undefined
      const { value, layer } = pickMergedMetric(s, c, p)
      merged[key] = value
      if (layer) layersUsed.add(layer)
    }

    const source = resolveSourceFromLayers(layersUsed)

    const cpv = deriveCpvFromLine(buyType, spend, deliverables)

    const row: ResolvedKPIRow = {
      mp_client_name: clientName,
      mba_number: mbaNumber,
      version_number: versionNumber,
      campaign_name: campaignName,
      media_type: mediaType,
      publisher,
      bid_strategy: bidStrategy,
      ctr: merged.ctr,
      cpv,
      conversion_rate: merged.conversion_rate,
      vtr: merged.vtr,
      frequency: merged.frequency,
      lineItemId,
      lineItemLabel: label,
      spend,
      deliverables,
      buyType,
      source,
      isManuallyEdited: false,
      hasPublisherKpi: Boolean(pubMatch),
      calculatedClicks: null,
      calculatedViews: null,
      calculatedReach: null,
    }

    return recalcRow(row)
  })
}

export function resolveAllKPIs(opts: {
  mediaItemsByType: Record<string, any[]>
  clientName: string
  mbaNumber: string
  versionNumber: number
  campaignName: string
  publisherKPIs: PublisherKPI[]
  clientKPIs: ClientKPI[]
  savedCampaignKPIs: CampaignKPI[]
  publishers?: Publisher[]
}): ResolvedKPIRow[] {
  const out: ResolvedKPIRow[] = []
  for (const [mediaType, items] of Object.entries(opts.mediaItemsByType)) {
    if (!items?.length) continue
    out.push(
      ...resolveKPIsForMediaType({
        lineItems: items,
        mediaType,
        clientName: opts.clientName,
        mbaNumber: opts.mbaNumber,
        versionNumber: opts.versionNumber,
        campaignName: opts.campaignName,
        publisherKPIs: opts.publisherKPIs,
        clientKPIs: opts.clientKPIs,
        savedCampaignKPIs: opts.savedCampaignKPIs,
        publishers: opts.publishers,
      }),
    )
  }
  return out
}
