import {
  coerceBuyTypeWithDevWarn,
  computeDeliverableFromMedia,
  parseLoadedDeliverableValue,
  roundDeliverables,
} from "@/lib/mediaplan/deliverableBudget"
import { parseBudgetSafe } from "@/lib/mediaplan/legacyBillingBursts"

/**
 * Cinema's own line rules on the shared channel container (W5f, C-341),
 * moved unchanged from its old container.
 */

type CinemaBurst = Record<string, unknown>

const isManualQuantity = (buyType: string) => buyType === "bonus" || buyType === "package_inclusions"

/**
 * The card's deliverables for one burst. Bonus and package inclusions keep the
 * quantity entered. Every other buy type, package included (Cinema works it
 * out from budget and rate, `packageDeliverableChannelSplit`), is the budget
 * over the rate, rounded; a blank rate is 0 (the shared rule reads it as 1).
 */
export function cinemaCardDeliverables(
  burst: CinemaBurst,
  buyType: string,
  budgetIncludesFees: boolean,
  feePct: number,
): number {
  if (isManualQuantity((buyType || "").toLowerCase())) {
    return parseLoadedDeliverableValue(burst?.calculatedValue ?? burst?.deliverables ?? 0)
  }
  const bt = coerceBuyTypeWithDevWarn(buyType, "CinemaContainer.cinemaBurstDeliverables")
  const value = computeDeliverableFromMedia({
    buyType: bt,
    rawBudget: parseLoadedDeliverableValue(burst?.budget ?? ""),
    buyAmount: parseLoadedDeliverableValue(burst?.buyAmount ?? ""),
    budgetIncludesFees,
    feePct: feePct || 0,
  })
  if (Number.isNaN(value)) return parseLoadedDeliverableValue(burst?.calculatedValue ?? "0")
  return roundDeliverables(bt, value)
}

type CinemaExcelLine = Record<string, unknown>

/**
 * One Excel row: network, station, placement (also as targeting), format as
 * creative, duration, a `lineItem` copy of the line number, and no platform
 * or buy amount. Deliverables: bonus, package inclusions and package keep
 * the saved quantity; the rest are budget over rate, rounded.
 */
export function cinemaExcelRow(
  row: Record<string, unknown>,
  line: CinemaExcelLine,
  burst: CinemaBurst,
  { feePct }: { feePct: number },
): Record<string, unknown> {
  const buyType = String(line.buyType || "")
  const lower = buyType.toLowerCase()
  let deliverables: unknown
  if (isManualQuantity(lower) || lower === "package") {
    deliverables = burst.calculatedValue ?? 0
  } else {
    const bt = coerceBuyTypeWithDevWarn(buyType, "CinemaContainer.excelBridge")
    const value = computeDeliverableFromMedia({
      buyType: bt,
      rawBudget: parseBudgetSafe(String(burst.budget)),
      buyAmount: parseBudgetSafe(String(burst.buyAmount ?? burst.budget)),
      budgetIncludesFees: !!line.budgetIncludesFees,
      feePct: feePct || 0,
    })
    deliverables = Number.isNaN(value) ? (burst.calculatedValue ?? 0) : roundDeliverables(bt, value)
  }
  return {
    market: line.market,
    network: line.network,
    station: line.station,
    bidStrategy: line.bidStrategy,
    targeting: line.placement,
    placement: line.placement,
    creative: line.format,
    duration: line.duration,
    startDate: row.startDate,
    endDate: row.endDate,
    deliverables,
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
