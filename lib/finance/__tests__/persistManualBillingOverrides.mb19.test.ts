/**
 * MB-19: orphan billing_overrides meta must not abort Save billing changes.
 * Choice (b): skip empty monthsIso (leave DB row); never return {ok:false} for one bad line.
 */
import assert from "node:assert/strict"
import { afterEach, describe, it, mock } from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import type { LineOverrideMeta } from "@/lib/finance/manualBillingOverridesUi"
import {
  manualBillingPersistSkipNotice,
  persistManualBillingOverrides,
} from "@/lib/finance/persistManualBillingOverrides"

function emptyMediaCosts(): BillingMonth["mediaCosts"] {
  return {} as BillingMonth["mediaCosts"]
}

function monthWithLivingLine(args: {
  lineId: string
  monthYear: string
  amount: number
  billingMode?: "auto" | "manual"
}): BillingMonth {
  return {
    monthYear: args.monthYear,
    mediaTotal: `$${args.amount.toFixed(2)}`,
    feeTotal: "$0.00",
    totalAmount: `$${args.amount.toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: emptyMediaCosts(),
    lineItems: {
      search: [
        {
          id: args.lineId,
          header1: "Google",
          header2: "Search",
          monthlyAmounts: { [args.monthYear]: args.amount },
          feeMonthlyAmounts: { [args.monthYear]: 0 },
          totalAmount: args.amount,
          billingMode: args.billingMode ?? "manual",
        },
      ],
    },
  }
}

type FetchCall = { url: string; body: Record<string, unknown> | null }

describe("MB-19 persistManualBillingOverrides orphan skip", () => {
  const originalFetch = globalThis.fetch
  let calls: FetchCall[] = []

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restoreAll()
    calls = []
  })

  function stubBillingOverrideFetch() {
    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null
      calls.push({ url, body })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })
  }

  function replaceCalls() {
    return calls.filter((c) => c.url.includes("/api/billing-overrides/replace_line"))
  }

  function resetCalls() {
    return calls.filter((c) => c.url.includes("/api/billing-overrides/reset_line"))
  }

  it("orphan meta + good line → good line persists; orphan skipped; reset_line not called for orphan", async () => {
    stubBillingOverrideFetch()

    const livingId = "billing-search::supabase001PB2"
    const orphanId = "supabase001PB1"
    const months: BillingMonth[] = [
      monthWithLivingLine({
        lineId: livingId,
        monthYear: "August 2026",
        amount: 10_000,
        billingMode: "manual",
      }),
    ]
    const autoMonths = months.map((m) => JSON.parse(JSON.stringify(m)) as BillingMonth)
    for (const m of autoMonths) {
      const li = m.lineItems!.search![0]!
      li.billingMode = "auto"
    }

    const metaByLine = new Map<string, LineOverrideMeta[]>([
      [
        orphanId,
        [{ mode: "manual", reason: "prepayment", dateBasis: "basis", component: "media" }],
      ],
      [
        livingId,
        [{ mode: "manual", reason: "manual", dateBasis: "basis", component: "media" }],
      ],
    ])

    const result = await persistManualBillingOverrides({
      versionId: 42,
      mbaNumber: "supabase001",
      months,
      autoMonthsForMediaTotals: autoMonths,
      metaByLine,
      getBurstsForLine: () => [{ startDate: "2026-08-01", endDate: "2026-08-31" }],
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.replacedMedia, 1)
    assert.equal(result.replacedFee, 0)
    assert.equal(result.reset, 0)
    assert.deepEqual(result.skippedEmptyMonths, [orphanId])

    const replaces = replaceCalls()
    assert.equal(replaces.length, 1)
    assert.equal(replaces[0]!.body?.line_item_id, "supabase001PB2")
    assert.equal(replaces[0]!.body?.component, "media")

    // (b) leave orphan row in place — reset_line must not run for it.
    assert.equal(resetCalls().length, 0)
  })

  it("orphan-only → ok with zero writes (BUX-6 Nothing to save); orphan row not reset", async () => {
    stubBillingOverrideFetch()

    const orphanId = "supabase001PB1"
    const months: BillingMonth[] = [
      {
        monthYear: "August 2026",
        mediaTotal: "$0.00",
        feeTotal: "$0.00",
        totalAmount: "$0.00",
        adservingTechFees: "$0.00",
        production: "$0.00",
        mediaCosts: emptyMediaCosts(),
        lineItems: { search: [] },
      },
    ]
    const metaByLine = new Map<string, LineOverrideMeta[]>([
      [
        orphanId,
        [{ mode: "manual", reason: "prepayment", dateBasis: "basis", component: "media" }],
      ],
    ])

    const result = await persistManualBillingOverrides({
      versionId: 42,
      mbaNumber: "supabase001",
      months,
      autoMonthsForMediaTotals: months,
      metaByLine,
      getBurstsForLine: () => [],
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.replacedMedia + result.replacedFee + result.reset, 0)
    assert.deepEqual(result.skippedEmptyMonths, [orphanId])
    assert.equal(replaceCalls().length, 0)
    assert.equal(resetCalls().length, 0)

    const notice = manualBillingPersistSkipNotice(result.skippedEmptyMonths)
    assert.ok(notice)
    assert.match(notice!, /no longer present/i)
  })

  it("manualBillingPersistSkipNotice is countable and actionable", () => {
    assert.equal(manualBillingPersistSkipNotice([]), null)
    assert.equal(
      manualBillingPersistSkipNotice(["a"]),
      "1 override was skipped because that plan line is no longer present."
    )
    assert.equal(
      manualBillingPersistSkipNotice(["a", "b"]),
      "2 overrides were skipped because those plan lines are no longer present."
    )
  })
})
