import { describe, expect, it } from "vitest"
import {
  billingTypeOptionsForTab,
  mergeTabSelection,
  statusOptionsForTab,
  tabOwnedSelection,
  tabSelectionMeansAll,
} from "@/lib/finance/financeTabFilterScope"
import type { BillingStatus, BillingType } from "@/lib/types/financeBilling"

const BILLING_TAB_STATUSES = statusOptionsForTab("billing")
const BILLING_TAB_TYPES = billingTypeOptionsForTab("billing")

describe("tabOwnedSelection", () => {
  it("shows only the values the active tab can offer", () => {
    const draft: BillingStatus[] = ["booked", "expected", "paid"]
    expect(tabOwnedSelection(draft, BILLING_TAB_STATUSES)).toEqual(["booked", "paid"])
  })
})

describe("mergeTabSelection", () => {
  it("preserves out-of-tab statuses when the tab control changes", () => {
    const draft: BillingStatus[] = ["booked", "expected"]
    expect(mergeTabSelection(["paid"], draft, BILLING_TAB_STATUSES)).toEqual(["paid", "expected"])
  })

  it("preserves payable when receivable types are edited", () => {
    const draft: BillingType[] = ["media", "payable"]
    expect(mergeTabSelection(["sow", "retainer"], draft, BILLING_TAB_TYPES)).toEqual([
      "sow",
      "retainer",
      "payable",
    ])
  })

  it("clearing the tab selection leaves out-of-tab values applied", () => {
    const draft: BillingStatus[] = ["booked", "expected"]
    expect(mergeTabSelection([], draft, BILLING_TAB_STATUSES)).toEqual(["expected"])
  })

  it("never inserts an out-of-tab value that was not already in the draft", () => {
    const draft: BillingStatus[] = ["booked"]
    expect(mergeTabSelection(["draft" as BillingStatus, "paid"], draft, BILLING_TAB_STATUSES)).toEqual(
      ["paid"]
    )
  })

  it("preserves a draft status already in the draft without offering it", () => {
    const draft: BillingStatus[] = ["draft", "booked"]
    expect(mergeTabSelection(["paid"], draft, BILLING_TAB_STATUSES)).toEqual(["paid", "draft"])
  })
})

describe("tabSelectionMeansAll", () => {
  it("is true only when nothing at all is applied", () => {
    expect(tabSelectionMeansAll([])).toBe(true)
  })

  it("is false when out-of-tab values remain applied and the intersection is empty", () => {
    const draft: BillingStatus[] = ["expected"]
    expect(tabOwnedSelection(draft, BILLING_TAB_STATUSES)).toEqual([])
    expect(tabSelectionMeansAll(draft)).toBe(false)
  })

  it("is false when the tab's own full option set is explicitly selected", () => {
    const draft = [...BILLING_TAB_STATUSES]
    expect(tabSelectionMeansAll(draft)).toBe(false)
    expect(tabOwnedSelection(draft, BILLING_TAB_STATUSES)).toEqual([...BILLING_TAB_STATUSES])
  })
})

describe("tab scoping", () => {
  it("never offers payable as a billing-type option", () => {
    for (const tab of ["overview", "billing", "payables", "accrual", "forecast", "report", "queue"] as const) {
      expect(billingTypeOptionsForTab(tab)).not.toContain("payable")
    }
  })

  it("never offers draft as a status option", () => {
    for (const tab of ["overview", "billing", "payables", "accrual", "forecast", "report", "queue"] as const) {
      expect(statusOptionsForTab(tab)).not.toContain("draft")
    }
  })
})
