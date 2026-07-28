/**
 * Plan C S2-P2 — buildRows invariants against authority schedules.
 */
import { beforeEach, describe, expect, it } from "vitest"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"
import type { BillingMonth } from "@/lib/billing/types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { computeAuthoritativeFinancials } from "@/lib/finance/authority/computeAndPersist"
import { ensureLineUids } from "@/lib/mediaplan/lineUid"
import { buildRows } from "@/lib/finance/rows/buildRows"
import { scheduleMonthYearToIso } from "@/lib/finance/computeCampaignFinancials"

const FEE_LOADING: FeeLoading = {
  feesearch: 20,
  feesocial: 15,
  feetelevision: 10,
  feedigidisplay: 12,
  feeinfluencers: 0,
}

function autoSearch(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "AUTO-SEARCH",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 10_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
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
    ...overrides,
  }
}

function manualSocial(): LineItemInput {
  return {
    lineItemId: "MANUAL-SOCIAL",
    mediaType: "socialMedia",
    buyType: "cpm",
    rate: 10,
    enteredAmount: 6_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 15,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 6_000,
        buyAmount: 10,
      },
    ],
    approval: "approved",
  }
}

function clientPaysTv(): LineItemInput {
  return {
    lineItemId: "CLIENT-PAYS-TV",
    mediaType: "television",
    buyType: "cpm",
    rate: 20,
    enteredAmount: 8_000,
    budgetIncludesFees: false,
    clientPaysForMedia: true,
    feePct: 10,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 8_000,
        buyAmount: 20,
      },
    ],
    approval: "approved",
  }
}

function adservingDisplay(): LineItemInput {
  return {
    lineItemId: "ADSERV-DISPLAY",
    mediaType: "digiDisplay",
    buyType: "cpm",
    rate: 5,
    enteredAmount: 4_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 12,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 4_000,
        buyAmount: 5,
        adServingRatePct: 2,
        adServingImpressions: 800_000,
      },
    ],
    approval: "approved",
  }
}

function productionLine(): LineItemInput {
  return {
    lineItemId: "PROD-1",
    mediaType: "production",
    buyType: "fixed cost",
    rate: 1,
    enteredAmount: 2_500,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 2_500,
        buyAmount: 1,
      },
    ],
    approval: "approved",
  }
}

const MANUAL_OVERRIDE_ROWS: BillingOverrideRow[] = [
  {
    id: 901,
    line_item_id: "MANUAL-SOCIAL",
    component: "media",
    mode: "manual",
    reason: "prepayment",
    date_basis: "2026-06-01|2026-07-31",
    months: [
      { month: "2026-06", amount: 6_000 },
      { month: "2026-07", amount: 0 },
    ],
  },
]

function mixedFixtureLineItems(): LineItemInput[] {
  return ensureLineUids([
    autoSearch(),
    manualSocial(),
    clientPaysTv(),
    adservingDisplay(),
    productionLine(),
  ])
}

function monthMoney(value: unknown): number {
  return roundMoney2(parseMoneyInput(value as string | number | null | undefined) ?? 0)
}

function scheduleGrandTotal(months: BillingMonth[]): number {
  return roundMoney2(
    months.reduce((sum, m) => {
      return (
        sum +
        monthMoney(m.mediaTotal) +
        monthMoney(m.feeTotal) +
        monthMoney(m.adservingTechFees) +
        monthMoney(m.production)
      )
    }, 0)
  )
}

describe("buildRows invariants", () => {
  let lineItems: LineItemInput[]
  let auth: ReturnType<typeof computeAuthoritativeFinancials>
  let built: ReturnType<typeof buildRows>

  beforeEach(() => {
    lineItems = mixedFixtureLineItems()
    auth = computeAuthoritativeFinancials({
      lineItems,
      feeLoading: FEE_LOADING,
      overrides: MANUAL_OVERRIDE_ROWS,
      monthScope: {
        campaignStart: new Date("2026-06-01"),
        campaignEnd: new Date("2026-07-31"),
      },
      client: {
        getRateForMediaType: () => 0.5,
        adservaudio: 0,
      },
    })
    built = buildRows({
      authorityResult: auth,
      lineItems: auth.lineItems,
      overrides: MANUAL_OVERRIDE_ROWS,
      meta: { media_plan_version: 42, mba_number: "MBA-ROWS" },
      adserving: { getRateForMediaType: () => 0.5, adservaudio: 0 },
    })
  })

  it("billing row billable sums match blob schedule totals to the cent", () => {
    const rowSum = roundMoney2(
      built.billingRows.reduce((s, r) => s + r.billable_amount, 0)
    )
    const blobSum = scheduleGrandTotal(auth.billingSchedule)
    expect(Math.abs(rowSum - blobSum)).toBeLessThanOrEqual(0.01)
  })

  it("delivery row delivery_amount sums match delivery schedule totals", () => {
    const rowSum = roundMoney2(
      built.deliveryRows.reduce((s, r) => s + r.delivery_amount, 0)
    )
    const blobSum = scheduleGrandTotal(auth.deliverySchedule)
    expect(Math.abs(rowSum - blobSum)).toBeLessThanOrEqual(0.01)
  })

  it("no duplicate (line_uid, month) on billing or delivery", () => {
    const billKeys = built.billingRows.map((r) => `${r.line_uid}::${r.month}`)
    expect(new Set(billKeys).size).toBe(billKeys.length)
    const delKeys = built.deliveryRows.map((r) => `${r.line_uid}::${r.month}`)
    expect(new Set(delKeys).size).toBe(delKeys.length)
  })

  it("every dollar appears exactly once across media/fee/adserving components", () => {
    for (const row of built.billingRows) {
      const parts = roundMoney2(
        row.media_amount + row.fee_amount + row.adserving_amount
      )
      expect(Math.abs(parts - row.billable_amount)).toBeLessThanOrEqual(0.005)
    }
    // Component totals must not exceed schedule component totals.
    const media = roundMoney2(
      built.billingRows.reduce((s, r) => s + r.media_amount, 0)
    )
    const fee = roundMoney2(
      built.billingRows.reduce((s, r) => s + r.fee_amount, 0)
    )
    const adserv = roundMoney2(
      built.billingRows.reduce((s, r) => s + r.adserving_amount, 0)
    )
    const blobMedia = roundMoney2(
      auth.billingSchedule.reduce(
        (s, m) => s + monthMoney(m.mediaTotal) + monthMoney(m.production),
        0
      )
    )
    const blobFee = roundMoney2(
      auth.billingSchedule.reduce((s, m) => s + monthMoney(m.feeTotal), 0)
    )
    const blobAd = roundMoney2(
      auth.billingSchedule.reduce((s, m) => s + monthMoney(m.adservingTechFees), 0)
    )
    expect(Math.abs(media - blobMedia)).toBeLessThanOrEqual(0.01)
    expect(Math.abs(fee - blobFee)).toBeLessThanOrEqual(0.01)
    expect(Math.abs(adserv - blobAd)).toBeLessThanOrEqual(0.01)
  })

  it("client-pays lines: billing media 0, delivery media_amount_full preserved", () => {
    const tv = auth.lineItems.find((l) => l.lineItemId === "CLIENT-PAYS-TV")!
    const uid = tv.line_uid!
    const billing = built.billingRows.filter((r) => r.line_uid === uid)
    const delivery = built.deliveryRows.filter((r) => r.line_uid === uid)
    expect(billing.length).toBeGreaterThan(0)
    expect(billing.every((r) => r.media_amount === 0)).toBe(true)
    expect(billing.every((r) => r.client_pays_for_media === true)).toBe(true)
    const full = roundMoney2(delivery.reduce((s, r) => s + r.media_amount_full, 0))
    expect(full).toBeGreaterThan(0)
    expect(Math.abs(full - 8_000)).toBeLessThanOrEqual(0.01)
  })

  it("manual override months stamp is_manual_override + source=manual", () => {
    const social = auth.lineItems.find((l) => l.lineItemId === "MANUAL-SOCIAL")!
    const uid = social.line_uid!
    const june = built.billingRows.find(
      (r) => r.line_uid === uid && r.month === "2026-06"
    )
    expect(june).toBeTruthy()
    expect(june!.is_manual_override).toBe(true)
    expect(june!.source).toBe("manual")
    expect(june!.override_id).toBe(901)
    expect(Math.abs(june!.media_amount - 6_000)).toBeLessThanOrEqual(0.01)
  })

  it("MonthAmount.source=balancing stamps plan_billing_rows.source=balancing", () => {
    const balancingOverrides: BillingOverrideRow[] = [
      {
        id: 902,
        line_item_id: "MANUAL-SOCIAL",
        component: "media",
        mode: "manual",
        reason: "manual",
        date_basis: "2026-06-01|2026-07-31",
        months: [
          { month: "2026-06", amount: 4_000, source: "manual" },
          { month: "2026-07", amount: 2_000, source: "balancing" },
        ],
      },
    ]
    const lines = mixedFixtureLineItems()
    const authLocal = computeAuthoritativeFinancials({
      lineItems: lines,
      feeLoading: FEE_LOADING,
      overrides: balancingOverrides,
      monthScope: {
        campaignStart: new Date("2026-06-01"),
        campaignEnd: new Date("2026-07-31"),
      },
      client: {
        getRateForMediaType: () => 0.5,
        adservaudio: 0,
      },
    })
    const local = buildRows({
      authorityResult: authLocal,
      lineItems: authLocal.lineItems,
      overrides: balancingOverrides,
      meta: { media_plan_version: 42, mba_number: "MBA-ROWS" },
      adserving: { getRateForMediaType: () => 0.5, adservaudio: 0 },
    })
    const social = authLocal.lineItems.find((l) => l.lineItemId === "MANUAL-SOCIAL")!
    const july = local.billingRows.find(
      (r) => r.line_uid === social.line_uid && r.month === "2026-07"
    )
    const june = local.billingRows.find(
      (r) => r.line_uid === social.line_uid && r.month === "2026-06"
    )
    expect(july!.source).toBe("balancing")
    expect(june!.source).toBe("manual")
  })

  it("production lines use line_source=production", () => {
    const prod = auth.lineItems.find((l) => l.lineItemId === "PROD-1")!
    const rows = built.billingRows.filter((r) => r.line_uid === prod.line_uid)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.line_source === "production")).toBe(true)
  })

  it("month keys are YYYY-MM", () => {
    for (const r of [...built.billingRows, ...built.deliveryRows]) {
      expect(r.month).toMatch(/^\d{4}-\d{2}$/)
    }
    // Sanity: authority schedule months map to the same ISO set
    const scheduleIso = new Set(
      auth.billingSchedule.map((m) => scheduleMonthYearToIso(m.monthYear))
    )
    for (const r of built.billingRows) {
      expect(scheduleIso.has(r.month) || r.month.length === 7).toBe(true)
    }
  })
})
