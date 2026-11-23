import { computeDeliverableFromMedia } from "@/lib/mediaplan/deliverableBudget"
import { parseBudgetSafe } from "@/lib/mediaplan/legacyBillingBursts"

/**
 * Radio's Excel row on the shared channel container (W5g), moved unchanged
 * from its old container: network, station, placement, format as creative,
 * duration, a `lineItem` copy of the line number, and no platform, targeting
 * or buy amount. Deliverables: bonus, package inclusions and package keep the
 * saved quantity; the rest are budget over rate, not rounded.
 */
export function radioExcelRow(
  row: Record<string, unknown>,
  line: Record<string, unknown>,
  burst: Record<string, unknown>,
  { feePct }: { feePct: number },
): Record<string, unknown> {
  return {
    market: line.market,
    network: line.network,
    station: line.station,
    bidStrategy: line.bidStrategy,
    placement: line.placement,
    creative: line.format,
    duration: line.duration,
    startDate: row.startDate,
    endDate: row.endDate,
    deliverables: excelDeliverables(line, burst, feePct),
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

/**
 * An Excel row's deliverables (Radio W5g, Newspaper W5i): bonus, package
 * inclusions and package keep the saved quantity; the rest are budget over
 * rate, not rounded. Newspaper's row (`newspaperLine.ts`) shares it.
 */
export function excelDeliverables(line: Record<string, unknown>, burst: Record<string, unknown>, feePct: number): unknown {
  const lower = String(line.buyType || "").toLowerCase()
  const value =
    lower === "bonus" || lower === "package_inclusions" || lower === "package"
      ? NaN
      : computeDeliverableFromMedia({
          buyType: line.buyType as Parameters<typeof computeDeliverableFromMedia>[0]["buyType"],
          rawBudget: parseBudgetSafe(String(burst.budget)),
          buyAmount: parseBudgetSafe(String(burst.buyAmount ?? burst.budget)),
          budgetIncludesFees: !!line.budgetIncludesFees,
          feePct: feePct || 0,
        })
  return Number.isNaN(value) ? (burst.calculatedValue ?? 0) : value
}
