import type { FinanceHubTab } from "@/lib/finance/useFinanceStore"
import type { BillingStatus, BillingType } from "@/lib/types/financeBilling"

/** Never includes `payable` — that value is implicit, not a user-selectable filter option. */
export const RECEIVABLE_BILLING_TYPES = [
  "media",
  "sow",
  "retainer",
] as const satisfies readonly BillingType[]

/** Store default minus `draft` (Overview's `KPI_RECEIVABLE_STATUSES`) — `cancelled` / `disputed` are typed but unused. */
export const RECEIVABLE_STATUSES = [
  "booked",
  "approved",
  "invoiced",
  "paid",
] as const satisfies readonly BillingStatus[]

/** Matches Overview's `KPI_PAYABLE_STATUSES`. */
export const PAYABLE_STATUSES = [
  "expected",
  "invoiced",
  "paid",
] as const satisfies readonly BillingStatus[]

/** Overview / Accrual consume billing *and* payables — union of both status vocabularies. */
export const OVERVIEW_ACCRUAL_STATUSES = [
  "booked",
  "approved",
  "invoiced",
  "paid",
  "expected",
] as const satisfies readonly BillingStatus[]

export function billingTypeOptionsForTab(tab: FinanceHubTab): readonly BillingType[] {
  switch (tab) {
    case "billing":
    case "report":
    case "overview":
    case "accrual":
      return RECEIVABLE_BILLING_TYPES
    case "payables":
    case "forecast":
    case "queue":
    default:
      return []
  }
}

export function statusOptionsForTab(tab: FinanceHubTab): readonly BillingStatus[] {
  switch (tab) {
    case "billing":
    case "report":
      return RECEIVABLE_STATUSES
    case "overview":
    case "accrual":
      return OVERVIEW_ACCRUAL_STATUSES
    case "payables":
      return PAYABLE_STATUSES
    case "forecast":
    case "queue":
    default:
      return []
  }
}

/**
 * The slice of a draft filter array the active tab's control owns — everything
 * else in the draft belongs to another tab's vocabulary and must survive edits here.
 */
export function tabOwnedSelection<T extends string>(
  draftValues: readonly T[],
  tabOptions: readonly T[]
): T[] {
  const owned = new Set<string>(tabOptions)
  return draftValues.filter((v) => owned.has(v))
}

/**
 * Merge a tab control's new selection back into the draft: the control replaces
 * only the values it can offer, and preserves out-of-tab values already applied
 * (e.g. `payable` while editing receivable types, `expected` while on Client
 * Billing). Values are only ever preserved, never inserted, by this path.
 */
export function mergeTabSelection<T extends string>(
  selected: readonly T[],
  draftValues: readonly T[],
  tabOptions: readonly T[]
): T[] {
  const owned = new Set<string>(tabOptions)
  return [...selected.filter((v) => owned.has(v)), ...draftValues.filter((v) => !owned.has(v))]
}

/**
 * Whether an empty tab-owned selection should read as "All" rather than a
 * placeholder. Only an entirely empty draft means "no filter"; an empty
 * intersection with out-of-tab values still applied is a real, narrowing filter
 * and must not claim "All".
 */
export function tabSelectionMeansAll<T extends string>(draftValues: readonly T[]): boolean {
  return draftValues.length === 0
}
