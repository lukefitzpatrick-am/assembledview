/**
 * Convert a staged ingest review into create/edit form line items.
 * Same stamp mapping accept uses — this is the form door, not a parallel mapper.
 */

import type { AutopopulateChannel } from "@/lib/ava/autopopulate/types"
import type { SavePlanLineItem } from "@/lib/data/savePlan"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import { uniqueTrimmedRefs } from "@/lib/mediaplans/ingest/ingestSourceRowRefs"
import {
  stampProposalForSave,
  type IngestPanelRow,
} from "@/lib/mediaplans/ingest/stampProposalForSave"

/** Placeholder MBA for stamp IDs only — never copied onto form items. */
const FORM_STAMP_MBA = "ingestform"

export function ingestReviewToFormLineItems(
  review: IngestReviewPackage,
): { channel: AutopopulateChannel; items: unknown[]; skipped: string[] } {
  const skipped = skippedFromReview(review)
  const channel = channelFromReview(review)
  if (!review.proposal) {
    return { channel, items: [], skipped }
  }

  const { lineItems, panels } = stampProposalForSave(
    review.proposal,
    FORM_STAMP_MBA,
  )
  const panelsByLine = new Map<string, IngestPanelRow[]>()
  for (const panel of panels) {
    const list = panelsByLine.get(panel.lineItemId) ?? []
    list.push(panel)
    panelsByLine.set(panel.lineItemId, list)
  }

  const items = lineItems.map((line, index) =>
    saveLineToFormItem(
      line,
      panelsByLine.get(line.lineItemId) ?? [],
      index,
      channel,
    ),
  )
  return { channel, items, skipped }
}

function skippedFromReview(review: IngestReviewPackage): string[] {
  const skipped: string[] = []
  for (const label of review.ignored.rows_unparsed_labels ?? []) {
    const named = label.trim()
    skipped.push(named ? `Unparsed row: ${named}` : "Unparsed row")
  }
  return skipped
}

function channelFromReview(review: IngestReviewPackage): AutopopulateChannel {
  const raw = (
    review.proposal?.media_type ??
    review.detected_media_type ??
    ""
  )
    .trim()
    .toLowerCase()
  return raw === "radio" ? "radio" : "ooh"
}

function asText(v: unknown): string {
  if (v == null) return ""
  return String(v).trim()
}

function formBursts(line: SavePlanLineItem): Record<string, unknown>[] {
  const raw = Array.isArray(line.bursts) ? line.bursts : []
  return raw.map((burst) => {
    const b = burst as Record<string, unknown>
    return {
      budget: b.budget ?? "",
      buyAmount: b.buyAmount ?? b.budget ?? "",
      startDate: b.startDate ?? "",
      endDate: b.endDate ?? "",
      calculatedValue: b.calculatedValue ?? 0,
      fee: b.fee ?? 0,
      mediaAmount: b.mediaAmount,
      feeAmount: b.feeAmount,
    }
  })
}

function formPanels(panels: IngestPanelRow[]): Record<string, unknown>[] {
  return panels.map((panel) => ({
    postcode: panel.postcode,
    siteNumber: panel.siteNumber,
    panelName: panel.panelName,
    format: panel.format,
    size: panel.size,
    state: panel.state,
    suburb: panel.suburb,
    geography: panel.geography,
    latitude: panel.latitude,
    longitude: panel.longitude,
    sourceRowRef: panel.sourceRowRef,
    sourcePublisher: panel.sourcePublisher,
    rawExtras: { ...panel.rawExtras },
    flights: panel.flights.map((f) => ({ ...f })),
    buyGranularity: panel.buyGranularity,
  }))
}

function saveLineToFormItem(
  line: SavePlanLineItem,
  panels: IngestPanelRow[],
  index: number,
  channel: AutopopulateChannel,
): Record<string, unknown> {
  const attrs =
    line.attrs && typeof line.attrs === "object" && !Array.isArray(line.attrs)
      ? { ...line.attrs }
      : {}
  const bursts = formBursts(line)
  const format = asText(attrs.format)
  const network = asText(attrs.network) || asText(line.publisher)
  const type = asText(attrs.type)
  const size = asText(attrs.size)
  const placement = asText(attrs.placement)
  const buyType = asText(line.buyType)
  const market = asText(line.market)
  const buyingDemo = asText(line.buyingDemo)
  const ingest_source_row_refs = uniqueTrimmedRefs(
    panels.map((panel) => panel.sourceRowRef),
  )
  const stampedAttrs =
    ingest_source_row_refs.length > 0
      ? { ...attrs, ingest_source_row_refs }
      : attrs

  const common = {
    network,
    format,
    market,
    size,
    placement,
    buy_type: buyType,
    buying_demo: buyingDemo,
    publisher: asText(line.publisher),
    fixed_cost_media: Boolean(line.fixedCostMedia),
    client_pays_for_media: Boolean(line.clientPaysForMedia),
    budget_includes_fees: Boolean(line.budgetIncludesFees),
    no_adserving: line.noAdserving !== false,
    line_item: index + 1,
    bursts,
    bursts_json: bursts,
    attrs: stampedAttrs,
    buy_granularity: stampedAttrs.buy_granularity,
    panels: formPanels(panels),
  }

  if (channel === "radio") {
    return {
      ...common,
      station: asText(attrs.station),
      platform: asText(line.platform),
      bid_strategy: asText(line.bidStrategy),
      duration: asText(attrs.duration),
      creative_targeting: "",
      creative: "",
      targeting_attribute: "",
    }
  }

  return {
    ...common,
    environment: type,
    type,
    location: placement,
    targeting_attribute: "",
    unit_rate: "",
  }
}
