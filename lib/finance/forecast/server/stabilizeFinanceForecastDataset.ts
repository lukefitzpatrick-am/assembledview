import type { FinanceForecastDataset, FinanceForecastLine } from "@/lib/types/financeForecast"
import {
  FINANCE_FORECAST_GROUP_KEYS,
  FINANCE_FORECAST_LINE_KEYS,
} from "@/lib/types/financeForecast"
import {
  FORECAST_BILLING_LINE_ORDER,
  FORECAST_REVENUE_BODY_LINE_ORDER,
} from "@/lib/finance/forecast/mapping"

const GROUP_ORDER: string[] = [
  FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation,
  FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
]

const REVENUE_WITH_TOTAL: readonly string[] = [
  ...FORECAST_REVENUE_BODY_LINE_ORDER,
  FINANCE_FORECAST_LINE_KEYS.totalRevenue,
]

function lineOrderIndex(groupKey: string, lineKey: FinanceForecastLine["line_key"]): number {
  if (groupKey === FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation) {
    const i = FORECAST_BILLING_LINE_ORDER.indexOf(lineKey)
    return i >= 0 ? i : 999
  }
  const i = REVENUE_WITH_TOTAL.indexOf(lineKey)
  return i >= 0 ? i : 999
}

function compareLines(a: FinanceForecastLine, b: FinanceForecastLine, groupKey: string): number {
  const oa = lineOrderIndex(groupKey, a.line_key)
  const ob = lineOrderIndex(groupKey, b.line_key)
  if (oa !== ob) return oa - ob
  const ma = String(a.mba_number ?? "")
  const mb = String(b.mba_number ?? "")
  const byMba = ma.localeCompare(mb, undefined, { sensitivity: "base" })
  if (byMba !== 0) return byMba
  const va = a.version_number ?? -1
  const vb = b.version_number ?? -1
  if (va !== vb) return va - vb
  const ca = String(a.campaign_id ?? "")
  const cb = String(b.campaign_id ?? "")
  return ca.localeCompare(cb, undefined, { sensitivity: "base" })
}

/**
 * Deterministic ordering for read-only reporting: clients A–Z, groups fixed, lines per mapping order then MBA/version.
 */
export function stabilizeFinanceForecastDataset(dataset: FinanceForecastDataset): FinanceForecastDataset {
  const client_blocks = [...dataset.client_blocks].sort((a, b) =>
    a.client_name.localeCompare(b.client_name, undefined, { sensitivity: "base" })
  )

  for (const block of client_blocks) {
    const groups = [...block.groups].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a.group_key)
      const ib = GROUP_ORDER.indexOf(b.group_key)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    for (const g of groups) {
      g.lines = [...g.lines].sort((a, b) => compareLines(a, b, g.group_key))
    }
    block.groups = groups
  }

  return { ...dataset, client_blocks }
}
