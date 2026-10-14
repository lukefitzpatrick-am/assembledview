import {
  WEB_REPORT_ELEMENTS,
  isWebElementId,
  parseElementSettings,
  type WebElementId,
  type WebReportLayoutItem,
} from "@/lib/webReport/elements"

/** Elements the MART views cannot fill yet. The library shows these as "Needs data". */
export const NEEDS_DATA_ELEMENTS: readonly WebElementId[] = ["location", "events", "srcmed", "gscPages"]

const NEEDS_DATA = new Set<WebElementId>(NEEDS_DATA_ELEMENTS)

export const WEB_REPORT_VERSION_KEEP = 10

export const MIGRATION_0098_KEY = "0098_ga4_gsc_accounts_and_creative_previews"

export const BUILDER_NEEDS_MIGRATION = "Builder needs migration 0098"

export function elementNeedsData(id: WebElementId): boolean {
  return NEEDS_DATA.has(id)
}

export function defaultElementSettings(id: WebElementId): unknown {
  switch (id) {
    case "kpis":
      return { tiles: [{ kind: "metric", metric: "sessions" }] }
    case "snapshot":
      return { tiles: ["sessions", "keyEvents", "clicks"] }
    case "notes":
      return { text: "" }
    case "traffic":
      return { bars: ["sessions", "pageViews"] }
    case "srcmed":
      return { topN: 10, columns: ["sessions", "keyEvents"], showChange: true, shade: true }
    case "pages":
    case "landing":
    case "gscPages":
      return { topN: 10 }
    case "location":
    case "events":
    case "paidSpend":
      return {}
    case "gscKpi":
      return { tiles: ["clicks", "impressions", "ctr", "position"] }
    case "queries":
      return { mode: "all", topN: 15 }
    case "costPer":
      return {}
    default:
      return {}
  }
}

export function addElement(layout: WebReportLayoutItem[], id: WebElementId): WebReportLayoutItem[] {
  return [...layout, { elementId: id, settings: defaultElementSettings(id) }]
}

export function moveElement(
  layout: WebReportLayoutItem[],
  index: number,
  direction: -1 | 1,
): WebReportLayoutItem[] {
  const next = index + direction
  if (index < 0 || index >= layout.length || next < 0 || next >= layout.length) return layout
  const copy = layout.slice()
  const [item] = copy.splice(index, 1)
  copy.splice(next, 0, item)
  return copy
}

export function removeElement(layout: WebReportLayoutItem[], index: number): WebReportLayoutItem[] {
  if (index < 0 || index >= layout.length) return layout
  return layout.filter((_, itemIndex) => itemIndex !== index)
}

export function elementTitle(id: WebElementId): string {
  return WEB_REPORT_ELEMENTS[id].title
}

export function parseLayout(
  value: unknown,
): { ok: true; layout: WebReportLayoutItem[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "The layout needs at least one element" }
  }
  const layout: WebReportLayoutItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "Each layout row needs an element" }
    }
    const elementId = (entry as { elementId?: unknown }).elementId
    if (typeof elementId !== "string" || !isWebElementId(elementId)) {
      return { ok: false, error: "Unknown report element" }
    }
    const parsed = parseElementSettings(elementId, (entry as { settings?: unknown }).settings)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    layout.push({ elementId, settings: parsed.settings })
  }
  return { ok: true, layout }
}

export function planSave(currentVersion: number): { nextVersion: number; dropAtOrBelow: number | null } {
  const nextVersion = Math.max(0, currentVersion) + 1
  const dropAtOrBelow = nextVersion > WEB_REPORT_VERSION_KEEP ? nextVersion - WEB_REPORT_VERSION_KEEP : null
  return { nextVersion, dropAtOrBelow }
}

export function savedForMessage(clientName: string, version: number): string {
  return `Saved for ${clientName} · version ${version}`
}

export function normaliseGa4PropertyRef(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/^properties\//i, "").trim()
  return digits.length > 0 ? digits : null
}

export function parseBrandTerms(value: string): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const part of value.split(",")) {
    const term = part.trim()
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    terms.push(term)
  }
  return terms
}
