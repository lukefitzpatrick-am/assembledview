import { excelDeliverables } from "@/lib/mediaplan/radioLine"

/**
 * Newspaper's Excel row on the shared channel container (W5i), moved
 * unchanged from its old container: network, title, the line's Ad Size,
 * placement and flags, Radio's deliverables rule (`excelDeliverables`), and
 * a `lineItem` copy of the line number.
 */
export function newspaperExcelRow(
  row: Record<string, unknown>,
  line: Record<string, unknown>,
  burst: Record<string, unknown>,
  { feePct }: { feePct: number },
): Record<string, unknown> {
  return {
    market: line.market || "",
    network: line.network,
    title: line.title,
    size: line.size,
    placement: line.placement || "",
    buyingDemo: line.buyingDemo || "",
    fixedCostMedia: line.fixedCostMedia || false,
    clientPaysForMedia: line.clientPaysForMedia || false,
    budgetIncludesFees: line.budgetIncludesFees || false,
    startDate: row.startDate,
    endDate: row.endDate,
    deliverables: excelDeliverables(line, burst, feePct),
    buyType: line.buyType,
    deliverablesAmount: burst.budget,
    grossMedia: row.grossMedia,
    line_item_id: row.line_item_id,
    lineItemId: row.lineItemId,
    line_item: row.line_item,
    lineItem: row.line_item,
  }
}
