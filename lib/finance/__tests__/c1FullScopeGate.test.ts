import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import {
  applyC1FullScopeGate,
  collectFullScopeDeltas,
  formatFullScopeUserMessage,
  resolvePlanCC1FullScopeMode,
  type PlanCC1FullScopeMode,
} from "../c1FullScopeGate.js"
import { assembleCampaignFinancialsWithOverrides } from "../authority/assembleWithOverrides.js"
import type { LineItemInput } from "../campaignFinancials.types.js"
import { recomputeAndValidateBillingScheduleOnSave } from "../recomputeBillingScheduleOnSave.js"
import { humaniseBillingSaveError } from "../humaniseBillingSaveError.js"
import { formatAUD, roundMoney2 } from "@/lib/format/money"

function withMode<T>(mode: PlanCC1FullScopeMode | "", fn: () => T): T {
  const prev = process.env.PLANC_C1_FULL_SCOPE
  process.env.PLANC_C1_FULL_SCOPE = mode
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.PLANC_C1_FULL_SCOPE
    else process.env.PLANC_C1_FULL_SCOPE = prev
  }
}

function digiDisplayLine(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "OH3",
    mediaType: "digiDisplay",
    buyType: "cpm",
    rate: 5,
    enteredAmount: 4_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 12,
    label: "OH3",
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 4_000,
        buyAmount: 5,
        deliverables: 800_000,
        adServingRatePct: 2,
      },
    ],
    approval: "approved",
    ...overrides,
  }
}

function productionLine(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "PROD-1",
    mediaType: "production",
    buyType: "fixed cost",
    rate: 1,
    enteredAmount: 2_500,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
    label: "PROD-1",
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 2_500,
        buyAmount: 1,
      },
    ],
    approval: "approved",
    ...overrides,
  }
}

function clientPaysSearch(): LineItemInput {
  return {
    lineItemId: "CP-SEARCH",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 10_000,
    budgetIncludesFees: false,
    clientPaysForMedia: true,
    feePct: 20,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 10_000,
        buyAmount: 1,
      },
    ],
    approval: "approved",
  }
}

function parseMoney(v: unknown): number {
  return roundMoney2(parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0)
}

function stampLineAdServing(
  schedule: BillingMonth[],
  lineId: string,
  mediaKey: string,
  total: number
): BillingMonth[] {
  return schedule.map((m) => {
    const items = m.lineItems?.[mediaKey]
    if (!Array.isArray(items) || items.length === 0) {
      // Inject a synthetic line row so collectClientAdServingByLine can see stamps.
      return {
        ...m,
        mediaCosts: { ...m.mediaCosts },
        lineItems: {
          ...(m.lineItems ?? {}),
          [mediaKey]: [
            {
              id: lineId,
              header1: lineId,
              header2: "",
              monthlyAmounts: { [m.monthYear]: parseMoney(m.mediaCosts?.[mediaKey as keyof typeof m.mediaCosts]) },
              totalAmount: parseMoney(m.mediaCosts?.[mediaKey as keyof typeof m.mediaCosts]),
              adServingMonthlyAmounts: { [m.monthYear]: total },
              totalAdServingAmount: total,
            },
          ],
        },
      }
    }
    return {
      ...m,
      mediaCosts: { ...m.mediaCosts },
      lineItems: {
        ...m.lineItems,
        [mediaKey]: items.map((li) =>
          String(li.id) === lineId
            ? {
                ...li,
                adServingMonthlyAmounts: { [m.monthYear]: total },
                totalAdServingAmount: total,
              }
            : li
        ),
      },
    }
  })
}

function driftProductionHeader(schedule: BillingMonth[], delta: number): BillingMonth[] {
  return schedule.map((m, i) => {
    if (i !== 0) return { ...m, mediaCosts: { ...m.mediaCosts } }
    const prod = parseMoney(m.production) + delta
    const total = parseMoney(m.totalAmount) + delta
    return {
      ...m,
      mediaCosts: { ...m.mediaCosts, production: `$${prod.toFixed(2)}` },
      production: `$${prod.toFixed(2)}`,
      totalAmount: `$${total.toFixed(2)}`,
    }
  })
}

const RATE = () => 0.5

test("resolvePlanCC1FullScopeMode defaults off", () => {
  withMode("off", () => assert.equal(resolvePlanCC1FullScopeMode(), "off"))
  withMode("log", () => assert.equal(resolvePlanCC1FullScopeMode(), "log"))
  withMode("enforce", () => assert.equal(resolvePlanCC1FullScopeMode(), "enforce"))
  withMode("", () => assert.equal(resolvePlanCC1FullScopeMode(), "off"))
})

test("clean pass: no full-scope deltas when client matches server", () => {
  const lineItems = [digiDisplayLine(), productionLine()]
  const { financials } = assembleCampaignFinancialsWithOverrides({
    lineItems,
    feeLoading: { feedigidisplay: 12 },
    overrideRows: [],
    opts: { getRateForMediaType: RATE },
  })
  const deltas = collectFullScopeDeltas({
    clientSchedule: financials.billingSchedule,
    lineItems,
    financials,
    opts: { getRateForMediaType: RATE },
  })
  assert.equal(deltas.length, 0)
})

test("adserving drift: collectFullScopeDeltas flags per-line adserving", () => {
  const lineItems = [digiDisplayLine()]
  const { financials } = assembleCampaignFinancialsWithOverrides({
    lineItems,
    feeLoading: { feedigidisplay: 12 },
    overrideRows: [],
    opts: { getRateForMediaType: RATE },
  })
  const serverAds = parseMoney(financials.billingSchedule[0]?.adservingTechFees)
  assert.ok(serverAds > 0, `expected server ads > 0, got ${serverAds}`)

  const drifted = stampLineAdServing(
    financials.billingSchedule,
    "OH3",
    "digiDisplay",
    roundMoney2(serverAds + 141)
  )
  // Keep media+fee headers intact so classic C1 would still pass.
  const deltas = collectFullScopeDeltas({
    clientSchedule: drifted,
    lineItems,
    financials,
    opts: { getRateForMediaType: RATE },
  })
  const ads = deltas.find((d) => d.field === "adserving" && d.lineItemId === "OH3")
  assert.ok(ads, `expected OH3 adserving delta; got ${JSON.stringify(deltas)}`)
  assert.ok(Math.abs(ads!.delta) > 0.01)
  assert.match(formatFullScopeUserMessage([ads!]), /Ad serving on line OH3/)
  assert.match(formatFullScopeUserMessage([ads!]), /\$141\.00|141/)
})

test("production drift: header production mismatch is flagged", () => {
  const lineItems = [productionLine()]
  const { financials } = assembleCampaignFinancialsWithOverrides({
    lineItems,
    feeLoading: {},
    overrideRows: [],
  })
  const drifted = driftProductionHeader(financials.billingSchedule, 50)
  const deltas = collectFullScopeDeltas({
    clientSchedule: drifted,
    lineItems,
    financials,
  })
  assert.ok(
    deltas.some((d) => d.field === "production" || d.field === "campaign_total"),
    `expected production/campaign delta; got ${JSON.stringify(deltas)}`
  )
})

test("client-pays exclusion: media not in billable campaign total", () => {
  const lineItems = [clientPaysSearch()]
  const { financials } = assembleCampaignFinancialsWithOverrides({
    lineItems,
    feeLoading: { feesearch: 20 },
    overrideRows: [],
  })
  // Client schedule equals server — clean.
  const deltas = collectFullScopeDeltas({
    clientSchedule: financials.billingSchedule,
    lineItems,
    financials,
    version: {},
  })
  assert.equal(deltas.length, 0)
  // Billable should be fee-only (media zeroed on billing for client-pays).
  assert.equal(financials.reconciliation?.clientPaysMedia, 10_000)
  assert.ok(
    (financials.reconciliation?.billableMbaExGst ?? 0) <
      (financials.mbaScopeTotals.nettExGst ?? 0)
  )
})

test("off mode: classic C1 ignores adserving drift (passes)", () => {
  withMode("off", () => {
    const lineItems = [digiDisplayLine()]
    const generated = recomputeAndValidateBillingScheduleOnSave({
      lineItems,
      feeLoading: { feedigidisplay: 12 },
      clientBillingSchedule: null,
      overrideRows: [],
      opts: { getRateForMediaType: RATE },
    })
    assert.equal(generated.ok, true)
    if (!generated.ok) return

    const serverAds = parseMoney(generated.billingSchedule[0]?.adservingTechFees)
    const drifted = stampLineAdServing(
      generated.billingSchedule,
      "OH3",
      "digiDisplay",
      roundMoney2(serverAds + 141)
    )
    // Also bump header ads so monthExGst drifts — but media+fee headers unchanged.
    const withHeader = drifted.map((m, i) =>
      i === 0
        ? {
            ...m,
            mediaCosts: { ...m.mediaCosts },
            adservingTechFees: `$${roundMoney2(serverAds + 141).toFixed(2)}`,
            totalAmount: `$${roundMoney2(parseMoney(m.totalAmount) + 141).toFixed(2)}`,
          }
        : m
    )

    const result = recomputeAndValidateBillingScheduleOnSave({
      lineItems,
      feeLoading: { feedigidisplay: 12 },
      clientBillingSchedule: withHeader,
      overrideRows: [],
      opts: { getRateForMediaType: RATE },
    })
    // Classic media+fee gate still passes under off.
    assert.equal(result.ok, true)
  })
})

test("log mode: passes but emits [planc-c1-fullscope]", () => {
  withMode("log", () => {
    const lineItems = [digiDisplayLine()]
    const generated = recomputeAndValidateBillingScheduleOnSave({
      lineItems,
      feeLoading: { feedigidisplay: 12 },
      clientBillingSchedule: null,
      overrideRows: [],
      opts: { getRateForMediaType: RATE },
    })
    assert.equal(generated.ok, true)
    if (!generated.ok) return

    const serverAds = parseMoney(generated.billingSchedule[0]?.adservingTechFees)
    const drifted = stampLineAdServing(
      generated.billingSchedule,
      "OH3",
      "digiDisplay",
      roundMoney2(serverAds + 141)
    ).map((m, i) =>
      i === 0
        ? {
            ...m,
            mediaCosts: { ...m.mediaCosts },
            adservingTechFees: `$${roundMoney2(serverAds + 141).toFixed(2)}`,
            totalAmount: `$${roundMoney2(parseMoney(m.totalAmount) + 141).toFixed(2)}`,
          }
        : m
    )

    const lines: string[] = []
    const original = console.log
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "))
    }
    try {
      const result = recomputeAndValidateBillingScheduleOnSave({
        lineItems,
        feeLoading: { feedigidisplay: 12 },
        clientBillingSchedule: drifted,
        overrideRows: [],
        opts: { getRateForMediaType: RATE },
        meta: { mba_number: "MBA-FS", version: 1 },
      })
      assert.equal(result.ok, true)
    } finally {
      console.log = original
    }
    assert.ok(
      lines.some((l) => l.includes("[planc-c1-fullscope]")),
      `expected fullscope log; got ${JSON.stringify(lines)}`
    )
  })
})

test("enforce mode: 409 with humanised adserving copy", () => {
  withMode("enforce", () => {
    const lineItems = [digiDisplayLine()]
    const generated = recomputeAndValidateBillingScheduleOnSave({
      lineItems,
      feeLoading: { feedigidisplay: 12 },
      clientBillingSchedule: null,
      overrideRows: [],
      opts: { getRateForMediaType: RATE },
    })
    assert.equal(generated.ok, true)
    if (!generated.ok) return

    const serverAds = parseMoney(generated.billingSchedule[0]?.adservingTechFees)
    const drifted = stampLineAdServing(
      generated.billingSchedule,
      "OH3",
      "digiDisplay",
      roundMoney2(serverAds + 141)
    ).map((m, i) =>
      i === 0
        ? {
            ...m,
            mediaCosts: { ...m.mediaCosts },
            adservingTechFees: `$${roundMoney2(serverAds + 141).toFixed(2)}`,
            totalAmount: `$${roundMoney2(parseMoney(m.totalAmount) + 141).toFixed(2)}`,
          }
        : m
    )

    const result = recomputeAndValidateBillingScheduleOnSave({
      lineItems,
      feeLoading: { feedigidisplay: 12 },
      clientBillingSchedule: drifted,
      overrideRows: [],
      opts: { getRateForMediaType: RATE },
      meta: { mba_number: "MBA-ENFORCE", version: 2 },
    })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.status, 409)
    assert.equal(result.body.code, "BILLING_SCHEDULE_DIVERGENCE")
    const human = humaniseBillingSaveError(result.body)
    assert.match(human, /Ad serving/i)
    assert.match(human, /OH3/)
  })
})

test("applyC1FullScopeGate off returns empty", () => {
  const lineItems = [digiDisplayLine()]
  const { financials } = assembleCampaignFinancialsWithOverrides({
    lineItems,
    feeLoading: { feedigidisplay: 12 },
    overrideRows: [],
    opts: { getRateForMediaType: RATE },
  })
  const drifted = driftProductionHeader(financials.billingSchedule, 99)
  const applied = applyC1FullScopeGate({
    mode: "off",
    clientSchedule: drifted,
    lineItems,
    financials,
    opts: { getRateForMediaType: RATE },
  })
  assert.deepEqual(applied.deltas, [])
  assert.equal(applied.shouldReject, false)
})

test("formatFullScopeUserMessage matches requested copy shape", () => {
  const msg = formatFullScopeUserMessage([
    {
      lineItemId: "OH3",
      field: "adserving",
      clientTotal: 200,
      serverTotal: 59,
      delta: 141,
      label: "OH3",
    },
  ])
  assert.equal(
    msg,
    `Ad serving on line OH3 differs from the approved MBA by ${formatAUD(141)}`
  )
})
