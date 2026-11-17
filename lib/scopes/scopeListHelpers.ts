import { parseScopeJSON, summarizeScopeScheduleCoverage } from "@/lib/finance/scopeScheduleExtract"
import { parseBillingScheduleAmount } from "@/lib/finance/utils"
import { matchTextAny } from "@/lib/search/matchText"
import { addMonthsISO } from "@/lib/dates/civil"
import { getMelbourneMonthISO } from "@/lib/dates/melbourne"

export function sumScopeCostItems(value: unknown): number {
  let items = value
  if (typeof items === "string") {
    try {
      items = JSON.parse(items)
    } catch {
      return 0
    }
  }
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, item) => {
    const raw =
      typeof item === "object" && item !== null
        ? ((item as { cost?: unknown; amount?: unknown }).cost ??
          (item as { amount?: unknown }).amount)
        : 0
    const amount = parseBillingScheduleAmount(raw as string | number)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

/** % of total cost that appears on the billing schedule (scheduled ÷ total). */
export function getScheduledCostPercentage(scope: {
  cost?: unknown
  billing_schedule?: unknown
  billingSchedule?: unknown
}): number {
  const totalCost = sumScopeCostItems(scope.cost)
  if (totalCost <= 0) return 0
  const schedule = parseScopeJSON(scope.billing_schedule ?? scope.billingSchedule)
  const scheduledCost = sumScopeCostItems(schedule)
  return Math.max(0, Math.min(100, (scheduledCost / totalCost) * 100))
}

/** ProgressBar tone from scheduled % (value-driven, not status-driven). */
export function progressToneForScheduledPct(
  pct: number,
): "danger" | "warning" | "info" | "success" | "default" {
  if (pct <= 0) return "danger"
  if (pct < 50) return "warning"
  if (pct < 100) return "info"
  return "success"
}

export function scopeScheduleGapLabel(
  scope: { billing_schedule?: unknown; billingSchedule?: unknown },
  year: number = Number(getMelbourneMonthISO().slice(0, 4)),
): string | null {
  const schedule = parseScopeJSON(scope.billing_schedule ?? scope.billingSchedule)
  return summarizeScopeScheduleCoverage(schedule, year).gapLabel
}

/** Search only fields shown on the list: client, scope id, project, value, date. */
export function scopeMatchesVisibleSearch(
  scope: {
    client_name?: string | null
    scope_id?: string | null
    project_name?: string | null
    scope_date?: string | null
    cost?: unknown
  },
  searchTerm: string,
): boolean {
  const value = sumScopeCostItems(scope.cost)
  const valueStr = Number.isFinite(value) ? value.toFixed(2) : ""
  return matchTextAny(
    [
      scope.client_name,
      scope.scope_id,
      scope.project_name,
      scope.scope_date,
      valueStr,
      value > 0 ? String(Math.round(value)) : "",
    ],
    searchTerm,
  )
}

/** Month picker for scopes of work: the Melbourne month and 12 either side, `YYYY-MM` with "November 2026" labels (create and edit). */
export function scopeMonthYearOptions(now: Date = new Date()): { value: string; label: string }[] {
  const current = getMelbourneMonthISO(now)
  return Array.from({ length: 25 }, (_, i) => {
    const value = addMonthsISO(current, i - 12)
    const [year, month] = value.split("-").map(Number)
    return { value, label: `${new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" })} ${year}` }
  })
}
