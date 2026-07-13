import type { MediaContainerLineItem } from "@/lib/api/media-containers"
import type { PlanningAudienceRow } from "@/lib/planning/audienceTypes"
import type { MediaContainerBestPractice } from "@/lib/types/publisher"
import type { CreativeAsset } from "@/lib/creative/types"
import type { PlanningMethodologyRow } from "@/lib/planning/types"
import { getTemplate } from "@/lib/naming/templates"
import { composeName } from "@/lib/naming/compose"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { asNumber, asString, capList, truncateText } from "./helpers"

const FEE_KEYS = [
  "feesearch",
  "feesocial",
  "feeprogdisplay",
  "feeprogvideo",
  "feeprogbvod",
  "feeprogaudio",
  "feeprogooh",
  "feecontentcreator",
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
  "feeinfluencers",
] as const

const PLATFORM_ID_KEYS = [
  "idgoogleads",
  "idmeta",
  "idcm360",
  "iddv360",
  "idtiktok",
  "idlinkedin",
  "idpinterest",
  "idquantcast",
  "idtaboola",
  "idsnapchat",
  "idbing",
  "idvistar",
  "idga4",
  "idmerchantcentre",
  "idshopify",
] as const

/** Canonical Ava tool names — keep in sync with registry registration order. */
export const AVA_TOOL_NAMES = [
  "get_media_plan_summary",
  "apply_form_patch",
  "get_client_details",
  "get_campaign_context",
  "get_saved_audiences",
  "get_best_practice",
  "get_naming_rules",
  "get_creative_assets",
  "get_methodology",
  "get_pacing_snapshot",
  "get_platform_specs",
  "start_mi_interview",
  "generate_mi_workbook",
  "load_skill",
  "generate_performance_report",
] as const

export function summariseClientDetails(raw: Record<string, unknown>) {
  const name = getClientDisplayName(raw)
  const fees: Record<string, unknown> = {}
  for (const key of FEE_KEYS) {
    if (raw[key] != null && raw[key] !== "") fees[key] = raw[key]
  }
  const platformIds: Record<string, boolean> = {}
  for (const key of PLATFORM_ID_KEYS) {
    const v = raw[key]
    platformIds[key] = v != null && String(v).trim() !== ""
  }
  return {
    id: raw.id ?? null,
    name,
    slug: slugifyClientNameForUrl(name) || null,
    brand_colour: asString(raw.brand_colour) ?? null,
    mbaidentifier: asString(raw.mbaidentifier) ?? null,
    fees,
    platformIdsPopulated: platformIds,
  }
}

export function summariseLineItem(channel: string, item: MediaContainerLineItem) {
  const budget =
    asNumber(item.totalMedia) ??
    asNumber(item.grossMedia) ??
    asNumber(item.budget) ??
    asNumber(item.spend) ??
    asNumber(item.investment) ??
    null
  return {
    id: item.id ?? null,
    line_item_id: asString(item.line_item_id) ?? asString(item.lineItemId) ?? null,
    channel,
    publisher:
      asString(item.publisher) ??
      asString(item.publisher_name) ??
      asString(item.platform) ??
      null,
    budget,
    name: truncateText(
      asString(item.placement) ?? asString(item.name) ?? asString(item.line_item_name) ?? "",
      120,
    ),
  }
}

export function summariseAudience(row: PlanningAudienceRow) {
  let definitionSummary = ""
  try {
    definitionSummary = truncateText(JSON.stringify(row.definition_json ?? null), 200)
  } catch {
    definitionSummary = "[unserializable]"
  }
  return {
    id: row.id,
    name: truncateText(row.name, 120),
    clients_id: row.clients_id,
    mba_number: row.mba_number ?? null,
    size: row.composed_wc,
    client_visible: row.client_visible,
    definitionSummary,
  }
}

export function summariseBestPractice(row: MediaContainerBestPractice) {
  const sections =
    row.best_practice && Array.isArray(row.best_practice.sections)
      ? row.best_practice.sections.map((s) => ({
          heading: truncateText(s.heading, 80),
          items: (s.items ?? []).slice(0, 8).map((i) => truncateText(i, 160)),
        }))
      : []
  return {
    id: row.id,
    media_container: row.media_container,
    is_active: row.is_active,
    sections,
  }
}

export function summariseNamingRules(
  platform: string,
  level: string,
  values: Record<string, string>,
) {
  const template = getTemplate(platform, level)
  if (!template) {
    return {
      error: `No naming template for platform="${platform}" level="${level}".`,
      elementOrder: [] as string[],
      preview: null as string | null,
    }
  }
  const elementOrder = template.elements.map((el) =>
    el.source === "literal" ? `lit:${el.literal ?? el.key}` : `${el.source}:${el.key}`,
  )
  let preview: string | null = null
  let composeError: string | null = null
  try {
    preview = composeName(template, values)
  } catch (err) {
    composeError = err instanceof Error ? err.message : String(err)
  }
  return {
    platform: template.platform,
    level: template.level,
    elementOrder,
    preview,
    composeError,
    valuesUsed: values,
  }
}

export function summariseCreativeAsset(asset: CreativeAsset) {
  return {
    id: asset.id,
    name: truncateText(asset.asset_name || asset.original_filename, 120),
    mime: asset.mime_type,
    width_px: asset.width_px,
    height_px: asset.height_px,
    line_item_id: asset.line_item_id,
    status: asset.status,
  }
}

export function summariseMethodology(row: PlanningMethodologyRow) {
  return {
    methodology_id: row.methodology_id,
    title: truncateText(row.title, 120),
    formula: truncateText(row.formula_text, 400),
    source: truncateText(row.data_source, 120),
    description: truncateText(row.description, 240),
  }
}

export type CompactPacingRow = {
  channel: string
  mbaNumber: string
  clientName: string
  campaignName: string
  lineItemId: string
  status: string
  spendToDate: number | null
  budget: number | null
}

function matchesClientFilter(row: CompactPacingRow, clientSlug?: string): boolean {
  if (!clientSlug) return true
  const want = slugifyClientNameForUrl(clientSlug)
  const got = slugifyClientNameForUrl(row.clientName)
  return Boolean(want && got && want === got)
}

function matchesMbaFilter(row: CompactPacingRow, mba?: string): boolean {
  if (!mba) return true
  return row.mbaNumber.trim().toLowerCase() === mba.trim().toLowerCase()
}

export function summarisePacingSnapshot(args: {
  asOfDate: string
  planSummary: string
  rows: CompactPacingRow[]
  clientSlug?: string
  mbaNumber?: string
}) {
  const filtered = args.rows.filter(
    (r) => matchesClientFilter(r, args.clientSlug) && matchesMbaFilter(r, args.mbaNumber),
  )
  const { items, truncated } = capList(filtered, 40)
  const byStatus: Record<string, number> = {}
  for (const r of filtered) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  }
  return {
    asOfDate: args.asOfDate,
    clientSlug: args.clientSlug ?? null,
    mbaNumber: args.mbaNumber ?? null,
    planSummary: truncateText(args.planSummary, 1200),
    rowCount: filtered.length,
    truncated,
    statusCounts: byStatus,
    rows: items,
  }
}
