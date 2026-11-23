import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "@/lib/mediaplan/lineItemIds"
import type { BillingBurst } from "@/lib/billing/types"
import type { UseFormReturn } from "react-hook-form"

/**
 * Television's own line rules on the shared channel container (W5h), moved
 * unchanged from its old container. A burst's deliverables are its TARPs
 * (`tarps`, written by the card's TARPs field); the line carries its Ad Size
 * and the sum of its bursts' TARPs.
 */

type Line = Record<string, unknown>
type Burst = Record<string, any>
type Ctx = { feePct: number; mbaNumber: string; campaignStartDate: Date; campaignEndDate: Date; index: number }

const TARPS_FALLBACKS = { bonusFallbackFields: ["calculatedValue", "deliverables", "tarps", "spots"] }

/** A burst's TARPs as a number (the summary and the line's load total). */
export const tarpsOf = (burst: Burst) => parseFloat(String(burst.tarps ?? "").replace(/[^0-9.]/g, "") || "0") || 0

/**
 * Load: every field from the field map, network from network, platform or
 * publisher, station from station, site or publisher, creative from
 * `creativeLength`, Ad Size and TARPs from the bursts when the line has none,
 * its own line number and id fallback (index + 1), and each burst's size,
 * TARPs and saved fee. Builds the line in the old key order from the hook's
 * field-map keys (the hook's own id, burst and total keys are dropped).
 */
export function televisionHydrateLine(line: Line, saved: Line, ctx: Ctx): Line & { bursts: Line[] } {
  const { line_item: _a, lineItem: _b, line_item_id: _c, lineItemId: _d, bursts: _e, totalMedia: _f, totalDeliverables: _g, totalFee: _h, ...fields } = line
  const { feePct, mbaNumber, campaignStartDate, campaignEndDate, index } = ctx
  const buyType = (saved.buy_type || saved.buyType) as string
  const includesFees = Boolean(saved.budget_includes_fees || saved.budgetIncludesFees)
  const parsed = resolveLineItemBursts(saved)
  const bursts: Burst[] =
    parsed.length > 0
      ? parsed.map((burst: Burst) => ({
          budget: burst.budget || "",
          buyAmount: burst.buyAmount || "",
          startDate: coerceBurstDateLocal(burst.startDate) ?? (campaignStartDate || new Date()),
          endDate: coerceBurstDateLocal(burst.endDate) ?? (campaignEndDate || new Date()),
          size: burst.size || "",
          tarps: burst.tarps || "",
          calculatedValue: computeLoadedDeliverables(buyType, burst, includesFees, feePct ?? 0, TARPS_FALLBACKS),
          fee: burst.fee ?? 0,
        }))
      : [
          {
            budget: "",
            buyAmount: "",
            startDate: campaignStartDate || new Date(),
            endDate: campaignEndDate || new Date(),
            size: "30s",
            tarps: "",
            calculatedValue: computeLoadedDeliverables(buyType, {}, includesFees, feePct ?? 0, TARPS_FALLBACKS),
            fee: 0,
          },
        ]
  const lineNum = Number(saved.line_item ?? saved.lineItem ?? index + 1) || index + 1
  const lineItemId = saved.line_item_id || saved.lineItemId || buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.television, lineNum)
  const tarps = bursts.reduce((sum, b) => sum + tarpsOf(b), 0)
  return {
    ...fields,
    network: saved.network || saved.platform || saved.publisher || "",
    station: saved.station || saved.site || saved.publisher || "",
    creative: saved.creative || saved.creativeLength || saved.creative_length || "",
    size: saved.size || bursts.find((b) => b.size)?.size || bursts[0]?.size || "30s",
    tarps: saved.tarps != null && String(saved.tarps) !== "" ? String(saved.tarps) : tarps > 0 ? String(tarps) : "",
    lineItemId,
    line_item_id: lineItemId,
    line_item: saved.line_item ?? saved.lineItem ?? index + 1,
    lineItem: saved.lineItem ?? saved.line_item ?? index + 1,
    bursts,
  }
}

/**
 * Billing: label "television", no line id, No Ad Serving always false, the
 * strip budget parser, and deliverables from the burst's TARPs.
 */
export function getTelevisionBursts(form: Pick<UseFormReturn, "getValues">, feePct: number): BillingBurst[] {
  const lines = (form.getValues("lineItems") || []) as Array<Burst>
  return lines.flatMap((li) =>
    li.bursts.map((burst: Burst) => {
      const rawBudget = parseFloat(burst.budget.replace(/[^0-9.]/g, "")) || 0
      const pct = feePct || 0
      const { mediaAmount, deliveryMediaAmount, feeAmount } = computeBurstAmounts({
        rawBudget,
        budgetIncludesFees: !!li.budgetIncludesFees,
        clientPaysForMedia: !!li.clientPaysForMedia,
        feePct: pct,
        buyType: li.buyType,
      })
      return {
        startDate: burst.startDate,
        endDate: burst.endDate,
        mediaAmount,
        deliveryMediaAmount,
        feeAmount,
        totalAmount: mediaAmount + feeAmount,
        mediaType: "television",
        feePercentage: pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        deliverables: parseFloat(burst?.tarps?.replace(/[^0-9.]/g, "") || "0") || 0,
        buyType: li.buyType,
        noAdserving: false,
      }
    }),
  )
}

/** Excel: network, station, daypart, placement, the burst's Ad Size, TARPs as deliverables, and a `lineItem` copy. */
export function televisionExcelRow(row: Line, line: Line, burst: Line): Line {
  return {
    market: line.market,
    network: line.network,
    station: line.station,
    daypart: line.daypart,
    placement: line.placement,
    bidStrategy: line.bidStrategy,
    creative: line.creative,
    size: burst.size,
    startDate: row.startDate,
    endDate: row.endDate,
    deliverables: burst.tarps ?? 0,
    buyingDemo: line.buyingDemo,
    buyType: line.buyType,
    deliverablesAmount: burst.budget,
    grossMedia: row.grossMedia,
    clientPaysForMedia: row.clientPaysForMedia,
    line_item_id: row.line_item_id,
    lineItemId: row.lineItemId,
    line_item: row.line_item,
    lineItem: row.line_item,
  }
}
