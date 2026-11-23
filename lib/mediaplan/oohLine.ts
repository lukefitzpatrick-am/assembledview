import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { excelBuyTypeFromLine } from "@/lib/mediaplan/buyTypeLabels"
import { parseLoadedDeliverableValue } from "@/lib/mediaplan/deliverableBudget"
import { MEDIA_TYPE_ID_CODES, buildLineItemId, pickLineItemNumber } from "@/lib/mediaplan/lineItemIds"
import { hydrateOohEditorLine } from "@/lib/mediaplans/ingest/hydrateEditorCard"
import type { BillingBurst } from "@/lib/billing/types"
import type { UseFormReturn } from "react-hook-form"

/**
 * OOH's own line rules on the shared channel container (W5k), moved
 * unchanged from its old container: the load (`hydrateOohEditorLine`), the
 * billing bursts and the Excel row.
 */

type Line = Record<string, unknown>
type FormLine = {
  bursts: Array<{ budget?: unknown; calculatedValue?: unknown; startDate: Date; endDate: Date }>
  budgetIncludesFees?: boolean
  clientPaysForMedia?: boolean
  buyType?: string
  noAdserving?: boolean
}
type Ctx = { feePct: number; mbaNumber: string; campaignStartDate: Date; campaignEndDate: Date; index: number }

/**
 * Load: the field map's fields, then OOH's editor card (network from
 * network, environment, publisher or `attrs`; format and buy type resolved,
 * else the raw text; type, size and placement fallbacks), its own line
 * number and id fallback (index + 1), the line's `attrs` and ingest
 * `buy_granularity` (the large-format gate reads them). Built in the old key
 * order from the hook's field-map keys.
 */
export function oohHydrateLine(line: Line, saved: Line, ctx: Ctx): Line & { bursts: Line[] } {
  const { line_item: _a, lineItem: _b, line_item_id: _c, lineItemId: _d, bursts: _e, totalMedia: _f, totalDeliverables: _g, totalFee: _h, ...fields } = line
  const lineNumber = pickLineItemNumber(saved, ctx.index + 1)
  const lineItemId = saved.line_item_id || saved.lineItemId || buildLineItemId(ctx.mbaNumber, MEDIA_TYPE_ID_CODES.ooh, lineNumber)
  const savedAttrs = saved.attrs as Line | undefined
  const hydrated = hydrateOohEditorLine(saved, ctx)
  return {
    ...fields,
    network: hydrated.network,
    format: hydrated.format ?? String(hydrated.attrs?.format_unresolved_raw ?? hydrated.attrs?.publisher_format_name ?? ""),
    buyType: hydrated.buyType ?? String(hydrated.attrs?.buyType_unresolved_raw ?? ""),
    type: hydrated.type,
    size: hydrated.size,
    market: hydrated.market,
    buyingDemo: hydrated.buyingDemo,
    placement: hydrated.placement,
    lineItemId,
    line_item_id: lineItemId,
    line_item: lineNumber,
    lineItem: lineNumber,
    attrs: hydrated.attrs ?? saved.attrs ?? undefined,
    buy_granularity: savedAttrs?.buy_granularity ?? saved.buy_granularity ?? saved.buyGranularity ?? undefined,
    bursts: hydrated.bursts,
  }
}

/** Billing: label "ooh", no line id, the line's camel `noAdserving` as it is (C-36), the saved deliverables. */
export function getOohBursts(form: Pick<UseFormReturn, "getValues">, feePct: number): BillingBurst[] {
  const lineItems = (form.getValues("lineItems") || []) as FormLine[]
  return lineItems.flatMap((li) =>
    li.bursts.map((burst) => {
      const rawBudget = parseLoadedDeliverableValue(burst.budget)
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
        mediaType: "ooh",
        feePercentage: pct,
        clientPaysForMedia: li.clientPaysForMedia as boolean,
        budgetIncludesFees: li.budgetIncludesFees as boolean,
        deliverables: (burst.calculatedValue ?? 0) as number,
        buyType: li.buyType as string,
        noAdserving: li.noAdserving as boolean,
      }
    }),
  )
}

/** Excel: OOH's format and type columns, the line's buy type, and a `lineItem` copy of the line number. */
export function oohExcelRow(row: Line, line: Line, burst: Line): Line {
  return {
    market: line.market || "",
    network: line.network || "",
    oohFormat: line.format || "",
    oohType: line.type || "",
    buyType: excelBuyTypeFromLine(line as { buyType?: string }),
    placement: line.placement || "",
    size: line.size || "",
    buyingDemo: line.buyingDemo || "",
    startDate: row.startDate,
    endDate: row.endDate,
    deliverables: row.deliverables,
    deliverablesAmount: row.deliverablesAmount,
    grossMedia: row.grossMedia,
    clientPaysForMedia: row.clientPaysForMedia,
    line_item_id: row.line_item_id,
    lineItemId: row.lineItemId,
    line_item: row.line_item,
    lineItem: row.line_item,
  }
}
