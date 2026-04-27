import type { Publisher } from "@/lib/types/publisher"
import type { GroupedLineItemForKPI } from "./grouping"

// --- from kpiMediaTypeAliases.ts ---

/** Normaliser for KPI media_type matching (client hub uses `digitalDisplay`, resolver uses `digiDisplay`). */
export function normMediaTypeKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
}

/** True when row media_type refers to the same channel as `resolverMediaType` (camelCase from containers). */
export function mediaTypeMatchesKpiRow(
  resolverMediaType: string,
  kpiRowMediaType: string,
): boolean {
  const a = normMediaTypeKey(resolverMediaType)
  const b = normMediaTypeKey(kpiRowMediaType)
  if (a === b) return true
  const canon = (x: string): string => {
    if (x === "digitaldisplay" || x === "digidisplay") return "digidisplay"
    if (x === "digitalaudio" || x === "digiaudio") return "digiaudio"
    if (x === "digitalvideo" || x === "digivideo") return "digivideo"
    return x
  }
  return canon(a) === canon(b)
}

// --- from publisherKpiLineMatch.ts ---

function normStr(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
}

/** Maps normalised publisherid → normalised publisher_name for KPI join (line items use display name). */
export function buildPublisherIdToNormNameMap(
  publishers: Publisher[],
): Map<string, string> {
  const m = new Map<string, string>()
  for (const p of publishers) {
    const id = String(p.publisherid ?? "").trim()
    if (!id) continue
    m.set(normStr(id), normStr(p.publisher_name))
  }
  return m
}

/**
 * Line-item publisher key is lowercase display name (`extractKPIKeys`).
 * `publisher_kpi.publisher` is often Xano publisher id; client rows use `publisher_name` (display name).
 */
export function linePublisherMatchesKpiPublisherField(
  linePublisherNorm: string,
  kpiPublisherField: string,
  idToNormName: Map<string, string>,
): boolean {
  const k = normStr(kpiPublisherField)
  if (!k) return false
  if (k === linePublisherNorm) return true
  const nameFromId = idToNormName.get(k)
  return Boolean(nameFromId && nameFromId === linePublisherNorm)
}

// --- from publisherMapping.ts ---

export type PublisherMappingResult = {
  publisher: string
  bidStrategy: string
  label: string
}

// Works with both raw LineItem (camelCase) and Xano-format items (snake_case).
// item is typed as any because containers emit two different shapes.
export function extractKPIKeys(
  item: GroupedLineItemForKPI | Record<string, any>,
  mediaType: string,
): PublisherMappingResult {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = (item as any)[k]
      if (v && String(v).trim()) return String(v).trim()
    }
    return ""
  }

  let publisher: string
  switch (mediaType) {
    case "search":
    case "socialMedia":
    case "progDisplay":
    case "progVideo":
    case "progBvod":
    case "progAudio":
    case "progOoh":
    case "integration":
    case "influencers":
    case "production":
      publisher = get("platform", "site")
      break
    case "digiDisplay":
    case "digiAudio":
    case "digiVideo":
    case "bvod":
      publisher = get("site", "platform", "network")
      break
    case "television":
    case "radio":
    case "ooh":
    case "cinema":
      publisher = get("network", "station", "platform")
      break
    case "newspaper":
    case "magazines":
      publisher = get("network", "title", "platform")
      break
    default:
      publisher = get("platform", "network", "site")
  }

  const bidStrategy = get(
    "bidStrategy",
    "bid_strategy",
    "buyType",
    "buy_type",
    "targeting",
    "creative_targeting",
    "creativeTargeting",
  )

  const label =
    get(
      "creative",
      "targeting",
      "creativeTargeting",
      "creative_targeting",
      "title",
      "placement",
      "station",
      "platform",
      "network",
    ) || "Line Item"

  return {
    publisher: publisher.toLowerCase().trim(),
    bidStrategy: bidStrategy.toLowerCase().trim(),
    label,
  }
}
