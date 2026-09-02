/**
 * Map a persisted / assembled OOH line onto the editor card form shape.
 * Network falls back to publisher (ingest stamps the profile name there).
 * Bursts prefer `bursts_json` when `bursts` is empty (OOH postgres assembly).
 */

import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import {
  computeLoadedDeliverables,
} from "@/lib/mediaplan/deliverableBudget"
import {
  defaultMediaBurstEndDate,
  defaultMediaBurstStartDate,
} from "@/lib/date-picker-anchor"
import {
  resolveControlledBuyType,
  resolveControlledFormat,
} from "@/lib/mediaplans/ingest/resolveControlledOoh"

export type HydrateEditorBurstOpts = {
  campaignStartDate: Date
  campaignEndDate: Date
  feePct: number
}

export type HydratedOohEditorBurst = {
  budget: string
  buyAmount: string
  startDate: Date
  endDate: Date
  calculatedValue: number
  fee: number
}

export type HydratedOohEditorLine = {
  network: string
  format: string | null
  buyType: string | null
  type: string
  size: string
  market: string
  buyingDemo: string
  placement: string
  bursts: HydratedOohEditorBurst[]
  attrs?: Record<string, unknown>
}

function asText(v: unknown): string {
  if (v == null) return ""
  const s = String(v).trim()
  return s
}

function asBudget(v: unknown): string {
  if (v == null || v === "") return ""
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : ""
  return String(v)
}

export function hydrateOohEditorLine(
  item: Record<string, unknown>,
  opts: HydrateEditorBurstOpts,
): HydratedOohEditorLine {
  const attrs =
    item.attrs && typeof item.attrs === "object" && !Array.isArray(item.attrs)
      ? (item.attrs as Record<string, unknown>)
      : undefined

  const network =
    asText(item.network) ||
    asText(item.environment) ||
    asText(item.publisher) ||
    asText(attrs?.network)
  const publisher =
    asText(item.publisher) || asText(attrs?.network)
  const formatRaw =
    asText(item.format) ||
    asText(attrs?.format) ||
    asText(item.format_unresolved_raw) ||
    asText(attrs?.format_unresolved_raw)
  const format = formatRaw
    ? resolveControlledFormat(formatRaw, publisher)
    : null
  const publisherFormatName =
    asText(item.publisher_format_name) ||
    asText(attrs?.publisher_format_name)
  const buyTypeRaw =
    asText(item.buy_type) ||
    asText(item.buyType) ||
    asText(attrs?.buyType) ||
    asText(item.buyType_unresolved_raw) ||
    asText(attrs?.buyType_unresolved_raw)
  const buyType = buyTypeRaw ? resolveControlledBuyType(buyTypeRaw) : null
  const type =
    asText(item.type) ||
    asText(item.environment) ||
    asText(attrs?.type)
  const size = asText(item.size) || asText(attrs?.size)
  const market = asText(item.market)
  const buyingDemo =
    asText(item.buying_demo) ||
    asText(item.buyingDemo)
  const placement =
    asText(item.placement) ||
    asText(item.location) ||
    asText(attrs?.placement)

  const parsedBursts = resolveLineItemBursts(item)
  const bursts: HydratedOohEditorBurst[] =
    parsedBursts.length > 0
      ? parsedBursts.map((burst: Record<string, unknown>) => ({
          budget: asBudget(burst.budget),
          buyAmount: asBudget(burst.buyAmount),
          startDate:
            coerceBurstDateLocal(
              (burst.startDate ?? burst.start_date) as string | Date | null,
            ) ?? defaultMediaBurstStartDate(opts.campaignStartDate, opts.campaignEndDate),
          endDate:
            coerceBurstDateLocal(
              (burst.endDate ?? burst.end_date) as string | Date | null,
            ) ?? defaultMediaBurstEndDate(opts.campaignStartDate, opts.campaignEndDate),
          calculatedValue: computeLoadedDeliverables(
            String(item.buy_type || item.buyType || buyType || ""),
            burst,
            Boolean(item.budget_includes_fees || item.budgetIncludesFees),
            opts.feePct,
            { bonusFallbackFields: ["calculatedValue", "deliverables"] },
          ),
          fee: Number(burst.fee ?? 0) || 0,
        }))
      : [
          {
            budget: "",
            buyAmount: "",
            startDate: defaultMediaBurstStartDate(
              opts.campaignStartDate,
              opts.campaignEndDate,
            ),
            endDate: defaultMediaBurstEndDate(
              opts.campaignStartDate,
              opts.campaignEndDate,
            ),
            calculatedValue: computeLoadedDeliverables(
              String(item.buy_type || item.buyType || buyType || ""),
              {},
              Boolean(item.budget_includes_fees || item.budgetIncludesFees),
              opts.feePct,
              { bonusFallbackFields: ["calculatedValue", "deliverables"] },
            ),
            fee: 0,
          },
        ]

  const unresolvedFormatRaw =
    format == null ? formatRaw || publisherFormatName : ""
  const unresolvedBuyTypeRaw = buyType == null ? buyTypeRaw : ""

  const mergedAttrs: Record<string, unknown> | undefined =
    attrs ||
    publisherFormatName ||
    unresolvedFormatRaw ||
    unresolvedBuyTypeRaw
      ? {
          ...(attrs ?? {}),
          ...(publisherFormatName
            ? { publisher_format_name: publisherFormatName }
            : {}),
          ...(unresolvedFormatRaw
            ? { format_unresolved_raw: unresolvedFormatRaw }
            : {}),
          ...(unresolvedBuyTypeRaw
            ? { buyType_unresolved_raw: unresolvedBuyTypeRaw }
            : {}),
        }
      : undefined

  return {
    network,
    format,
    buyType,
    type,
    size,
    market,
    buyingDemo,
    placement,
    bursts,
    attrs: mergedAttrs,
  }
}
