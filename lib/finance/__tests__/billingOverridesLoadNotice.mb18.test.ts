import assert from "node:assert/strict"
import test from "node:test"

import {
  BILLING_OVERRIDES_LOAD_FAILED_NOTICE,
  nextBillingOverridesLoadNotice,
} from "../billingOverridesLoadNotice.js"
import {
  applyBillingOverrideRowsToMonths,
  warnBillingOverrideMediaKeyMiss,
} from "../manualBillingOverridesUi.js"
import type { BillingMonth } from "@/lib/billing/types"

test("MB-18: unresolved version id never sets the load notice", () => {
  assert.equal(nextBillingOverridesLoadNotice({ kind: "version_unresolved" }), null)
})

test("MB-18: fetch ok clears the notice", () => {
  assert.equal(nextBillingOverridesLoadNotice({ kind: "fetch_ok" }), null)
})

test("MB-18: fetch failure sets the shared banner string", () => {
  assert.equal(
    nextBillingOverridesLoadNotice({ kind: "fetch_failed" }),
    BILLING_OVERRIDES_LOAD_FAILED_NOTICE
  )
  assert.match(BILLING_OVERRIDES_LOAD_FAILED_NOTICE, /could not be loaded/i)
})

/**
 * Race: unresolved → resolve → fetch ok. Notice must stay null throughout
 * (policy), and a later fetch_failed must still surface.
 */
test("MB-18: race resolve never shows notice; fetch reject does", () => {
  const timeline: Array<string | null> = []
  timeline.push(nextBillingOverridesLoadNotice({ kind: "version_unresolved" }))
  timeline.push(nextBillingOverridesLoadNotice({ kind: "fetch_ok" }))
  assert.deepEqual(timeline, [null, null], "no notice across unresolved → ok")
  assert.equal(
    nextBillingOverridesLoadNotice({ kind: "fetch_failed" }),
    BILLING_OVERRIDES_LOAD_FAILED_NOTICE
  )
})

test("MB-18: mediaKey miss warns once per line id with bucket keys", () => {
  const warns: unknown[][] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    warns.push(args)
  }
  try {
    const seen = new Set<string>()
    warnBillingOverrideMediaKeyMiss({
      lineItemId: "orphan-line",
      component: "media",
      availableBucketKeys: ["search", "progBvod"],
      warnedLineIds: seen,
    })
    warnBillingOverrideMediaKeyMiss({
      lineItemId: "orphan-line",
      component: "fee",
      availableBucketKeys: ["search", "progBvod"],
      warnedLineIds: seen,
    })
    assert.equal(warns.length, 1, "once per line id")
    assert.match(String(warns[0]![0]), /no mediaKey for override line/i)
    const payload = warns[0]![1] as {
      line_item_id: string
      component: string
      availableBucketKeys: string[]
    }
    assert.equal(payload.line_item_id, "orphan-line")
    assert.equal(payload.component, "media")
    assert.deepEqual(payload.availableBucketKeys, ["search", "progBvod"])
  } finally {
    console.warn = original
  }
})

test("MB-18: apply overlay with orphan override warns and leaves AUTO amounts", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "August 2026",
      mediaTotal: "$100.00",
      feeTotal: "$0.00",
      totalAmount: "$100.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: {} as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "S-1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 100 },
            totalAmount: 100,
            billingMode: "auto",
          },
        ],
      },
    },
  ]
  const warns: unknown[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    warns.push(args[0])
  }
  try {
    const { months: overlaid, metaByLine } = applyBillingOverrideRowsToMonths(months, [
      {
        line_item_id: "DELETED-LINE",
        component: "media",
        mode: "manual",
        reason: "manual",
        date_basis: "x",
        months: [{ month: "2026-08", amount: 999 }],
      },
    ])
    assert.equal(metaByLine.get("DELETED-LINE")?.[0]?.mode, "manual")
    assert.equal(overlaid[0]!.lineItems!.search![0]!.monthlyAmounts["August 2026"], 100)
    assert.equal(overlaid[0]!.lineItems!.search![0]!.billingMode, "auto")
    assert.equal(warns.length, 1)
  } finally {
    console.warn = original
  }
})
