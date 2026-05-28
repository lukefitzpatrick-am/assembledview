import { buildSpreadsheetRegistry } from "@/lib/spreadsheet/registry"
import type { SpreadsheetRegistryTableSpec } from "@/lib/spreadsheet/types"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

const COST_ACCORDION = "manual-billing-costs"
const COST_ROW_IDS = ["fee", "adServing", "production"] as const

export type ManualBillingMediaSection = Readonly<{
  accordionValue: string
  mediaKey: string
  lineItems: readonly BillingLineItem[]
}>

export type BuildManualBillingRegistryArgs = Readonly<{
  months: readonly BillingMonth[]
  expandedAccordionValues: readonly string[]
  mediaSections: readonly ManualBillingMediaSection[]
  includeCostTable?: boolean
  /** When set, only these media keys are included (phase-2 single-table scope). */
  scopeMediaKeys?: readonly string[] | null
}>

export function buildManualBillingSpreadsheetRegistry(args: BuildManualBillingRegistryArgs) {
  const monthYears = args.months.map((m) => m.monthYear)
  const expanded = new Set(args.expandedAccordionValues)
  const scope =
    args.scopeMediaKeys && args.scopeMediaKeys.length > 0
      ? new Set(args.scopeMediaKeys)
      : null

  const tables: SpreadsheetRegistryTableSpec[] = []

  for (const section of args.mediaSections) {
    if (scope && !scope.has(section.mediaKey)) continue
    if (!section.lineItems.length) continue
    tables.push({
      tableKey: section.mediaKey,
      expanded: expanded.has(section.accordionValue),
      rows: section.lineItems.map((li) => ({
        rowKind: "lineItem",
        rowId: li.id,
      })),
    })
  }

  if (args.includeCostTable !== false && (!scope || scope.has("cost"))) {
    tables.push({
      tableKey: "cost",
      expanded: expanded.has(COST_ACCORDION),
      rows: COST_ROW_IDS.map((rowId) => ({ rowKind: "cost", rowId })),
    })
  }

  return buildSpreadsheetRegistry(monthYears, tables)
}

export { COST_ACCORDION }
