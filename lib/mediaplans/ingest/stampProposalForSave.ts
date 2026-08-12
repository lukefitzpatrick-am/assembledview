/**
 * Map an ingest proposal onto SavePlanLineItem[] + panel rows.
 * Never mints line_item_id here — assignStableLineItemNumbers stamps them.
 */

import type { LineChannel } from "@/db/schema"
import type { SavePlanLineItem } from "@/lib/data/savePlan"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import { assignStableLineItemNumbers } from "@/lib/mediaplan/lineItemOrder"
import type {
  IngestProposal,
  ProposedLineItem,
  ProposedPanel,
} from "@/lib/mediaplans/ingest/proposeLineItems"

export type IngestPanelFlightRow = {
  periodStart: string
  periodEnd: string
  isLive: boolean
  isBonus: boolean
  /** Not persisted — review / tests only. */
  periodCount: number
}

export type IngestPanelRow = {
  lineItemId: string
  mbaNumber: string
  buyGranularity: "panel" | "pack"
  latitude: string | null
  longitude: string | null
  publisherFormatName: string | null
  state: string | null
  siteNumber: string | null
  addressOrPackDetails: string | null
  suburb: string | null
  postcode: string | null
  direction: string | null
  geography: string | null
  format: string | null
  size: string | null
  orientation: string | null
  digitalSpec: string | null
  illumination: string | null
  digitalOperatingHours: string | null
  rotationSeconds: string | null
  advertiserShare: string | null
  panelName: string | null
  villageName: string | null
  panelWeight: string | null
  sourcePublisher: string | null
  sourceRowRef: string | null
  /** Unmapped publisher columns — never discarded. */
  rawExtras: Record<string, string>
  flights: IngestPanelFlightRow[]
}

function channelForMediaType(mediaType: string): LineChannel {
  const t = mediaType.trim().toLowerCase()
  if (t === "radio") return "radio"
  return "ooh"
}

function mediaCodeForChannel(channel: LineChannel): string {
  if (channel === "radio") return MEDIA_TYPE_ID_CODES.radio
  return MEDIA_TYPE_ID_CODES.ooh
}

function mediaTypeKeyForChannel(channel: LineChannel): "radio" | "ooh" {
  if (channel === "radio") return "radio"
  return "ooh"
}

function burstFromProposed(b: ProposedLineItem["bursts"][number]) {
  return {
    startDate: b.start_date ?? "",
    endDate: b.end_date ?? "",
    budget: b.media_amount,
    buyAmount: b.quantity,
  }
}

function labelForLine(item: ProposedLineItem): string {
  const parts = [
    item.grouping.format,
    item.grouping.state,
    item.grouping.market,
    item.grouping.station,
    item.grouping.media_description,
    item.grouping.daypart,
  ].filter(Boolean)
  return parts.join(" · ") || "Imported line"
}

function marketForLine(item: ProposedLineItem): string | null {
  return (
    item.grouping.market ||
    item.grouping.state ||
    item.grouping.geography ||
    null
  )
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

function numStr(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const n = Number(s.replace(/[^0-9.-]+/g, ""))
  return Number.isFinite(n) ? String(n) : s
}

export function proposedPanelToRow(
  panel: ProposedPanel,
  args: {
    lineItemId: string
    mbaNumber: string
    buyGranularity: "panel" | "pack"
  },
): IngestPanelRow {
  const d = panel.descriptors
  return {
    lineItemId: args.lineItemId,
    mbaNumber: args.mbaNumber.toLowerCase(),
    buyGranularity: args.buyGranularity,
    latitude: numStr(d.latitude),
    longitude: numStr(d.longitude),
    publisherFormatName: str(d.publisher_format_name),
    state: str(d.state),
    siteNumber: str(d.site_number),
    addressOrPackDetails: str(d.address_or_pack_details),
    suburb: str(d.suburb),
    postcode: str(d.postcode),
    direction: str(d.direction),
    geography: str(d.geography),
    format: str(d.format),
    size: str(d.size),
    orientation: str(d.orientation),
    digitalSpec: str(d.digital_spec),
    illumination: str(d.illumination),
    digitalOperatingHours: str(d.digital_operating_hours),
    rotationSeconds: numStr(d.rotation_seconds),
    advertiserShare: numStr(d.advertiser_share),
    panelName: str(d.panel_name),
    villageName: str(d.village_name),
    panelWeight: numStr(d.panel_weight),
    sourcePublisher: panel.source_publisher || null,
    sourceRowRef: panel.source_row_ref || null,
    rawExtras: { ...panel.raw_unmapped },
    flights: (panel.flights ?? []).map((f) => ({
      periodStart: f.period_start,
      periodEnd: f.period_end,
      isLive: f.is_live,
      isBonus: f.is_bonus,
      periodCount: f.period_count,
    })),
  }
}

/**
 * Convert proposal → SavePlanLineItem[] with stable IDs, plus panel rows
 * keyed by those IDs. Does not call savePlanVersion.
 */
export function stampProposalForSave(
  proposal: IngestProposal,
  mbaNumber: string,
): {
  lineItems: SavePlanLineItem[]
  panels: IngestPanelRow[]
} {
  const channel = channelForMediaType(proposal.media_type)
  const mediaType = mediaTypeKeyForChannel(channel)
  const code = mediaCodeForChannel(channel)

  const stubs = proposal.line_items.map((item, index) => {
    const mediaSum = item.bursts.reduce((s, b) => s + (b.media_amount || 0), 0)
    const buyGranularity: "panel" | "pack" =
      item.panels.length > 1 ? "pack" : "panel"
    const line: SavePlanLineItem & {
      line_item_id?: string
      lineItemId?: string
      line_item?: number
    } = {
      lineItemId: "", // stamped below
      channel,
      mediaType,
      market: marketForLine(item),
      publisher: proposal.publisher_name,
      buyType: "fixed",
      rate: 0,
      enteredAmount: mediaSum,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      noAdserving: true,
      feePct: 0,
      approval: "approved",
      label: labelForLine(item),
      position: index + 1,
      bursts: item.bursts.map(burstFromProposed),
      attrs: {
        format: item.grouping.format ?? null,
        network: item.grouping.network ?? null,
        ingest_grouping: item.grouping,
        ingest_sheet: proposal.sheet_name,
        /** Survives hydrate so OOHContainer can gate card vs expert without reloading panels. */
        buy_granularity: buyGranularity,
      },
    }
    return line
  })

  const stamped = assignStableLineItemNumbers(stubs, mbaNumber, code)

  const panels: IngestPanelRow[] = []
  for (let i = 0; i < proposal.line_items.length; i++) {
    const item = proposal.line_items[i]!
    const lineItemId = String(stamped[i]!.lineItemId)
    const buyGranularity: "panel" | "pack" =
      item.panels.length > 1 ? "pack" : "panel"
    for (const p of item.panels) {
      panels.push(
        proposedPanelToRow(p, {
          lineItemId,
          mbaNumber,
          buyGranularity,
        }),
      )
    }
  }

  return {
    lineItems: stamped.map((s) => ({
      lineItemId: String(s.lineItemId),
      channel: s.channel,
      mediaType: s.mediaType,
      market: s.market,
      publisher: s.publisher,
      buyType: s.buyType,
      rate: s.rate,
      enteredAmount: s.enteredAmount,
      budgetIncludesFees: s.budgetIncludesFees,
      clientPaysForMedia: s.clientPaysForMedia,
      noAdserving: s.noAdserving,
      feePct: s.feePct,
      approval: s.approval,
      label: s.label,
      position: s.position,
      bursts: s.bursts,
      attrs: s.attrs,
    })),
    panels,
  }
}
