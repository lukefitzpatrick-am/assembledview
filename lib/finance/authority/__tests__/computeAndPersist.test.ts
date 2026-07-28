import assert from "node:assert/strict"
import test from "node:test"

import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"
import type { BillingMonth } from "@/lib/billing/types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { billingMonthsHaveDetailedLineItems } from "@/lib/mediaplan/partialMba"
import {
  applyPlanCServerAuthority,
  computeAuthoritativeFinancials,
  diffClientVsAuthoritySchedule,
  resolvePlanCServerAuthorityMode,
  type PlanCServerAuthorityMode,
} from "../computeAndPersist.js"

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
  return [
    autoSearch(),
    manualSocial(),
    clientPaysTv(),
    adservingDisplay(),
    productionLine(),
  ]
}

function monthMoney(value: unknown): number {
  return roundMoney2(parseMoneyInput(value as string | number | null | undefined) ?? 0)
}

function scheduleMonthTotals(months: BillingMonth[]): Map<string, { media: number; fee: number }> {
  const map = new Map<string, { media: number; fee: number }>()
  for (const m of months) {
    map.set(m.monthYear, {
      media: monthMoney(m.mediaTotal),
      fee: monthMoney(m.feeTotal),
    })
  }
  return map
}

function assertScheduleMoneyEqual(a: BillingMonth[], b: BillingMonth[], label: string) {
  const aTotals = scheduleMonthTotals(a)
  const bTotals = scheduleMonthTotals(b)
  const keys = new Set([...aTotals.keys(), ...bTotals.keys()])
  for (const key of [...keys].sort()) {
    const left = aTotals.get(key) ?? { media: 0, fee: 0 }
    const right = bTotals.get(key) ?? { media: 0, fee: 0 }
    assert.ok(
      Math.abs(left.media - right.media) <= 0.01,
      `${label}: ${key} media ${left.media} vs ${right.media}`
    )
    assert.ok(
      Math.abs(left.fee - right.fee) <= 0.01,
      `${label}: ${key} fee ${left.fee} vs ${right.fee}`
    )
  }
}

function driftClientSchedule(server: BillingMonth[]): BillingMonth[] {
  return server.map((m, i) =>
    i === 0
      ? {
          ...m,
          mediaCosts: { ...m.mediaCosts },
          mediaTotal: `$${monthMoney(m.mediaTotal) + 50}.00`,
          totalAmount: `$${monthMoney(m.totalAmount) + 50}.00`,
        }
      : { ...m, mediaCosts: { ...m.mediaCosts } }
  )
}

function withMode<T>(mode: PlanCServerAuthorityMode, fn: () => T): T {
  const prev = process.env.PLANC_SERVER_AUTHORITY
  process.env.PLANC_SERVER_AUTHORITY = mode
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.PLANC_SERVER_AUTHORITY
    else process.env.PLANC_SERVER_AUTHORITY = prev
  }
}

test("resolvePlanCServerAuthorityMode: defaults off; accepts log/enforce", () => {
  withMode("off", () => assert.equal(resolvePlanCServerAuthorityMode(), "off"))
  withMode("log", () => assert.equal(resolvePlanCServerAuthorityMode(), "log"))
  withMode("enforce", () => assert.equal(resolvePlanCServerAuthorityMode(), "enforce"))
  withMode("" as PlanCServerAuthorityMode, () =>
    assert.equal(resolvePlanCServerAuthorityMode(), "off")
  )
})

test("fixture: off/log/enforce persist identical money for a clean client schedule", () => {
  const lineItems = mixedFixtureLineItems()
  const auth = computeAuthoritativeFinancials({
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

  const cleanClient = JSON.parse(JSON.stringify(auth.billingSchedule)) as BillingMonth[]

  const off = applyPlanCServerAuthority({
    mode: "off",
    clientBillingSchedule: cleanClient,
    clientDeliverySchedule: auth.deliverySchedule,
    authoritative: auth,
    meta: { mba_number: "MBA-FIX", version: 1 },
  })
  const log = applyPlanCServerAuthority({
    mode: "log",
    clientBillingSchedule: cleanClient,
    clientDeliverySchedule: auth.deliverySchedule,
    authoritative: auth,
    meta: { mba_number: "MBA-FIX", version: 1 },
  })
  const enforce = applyPlanCServerAuthority({
    mode: "enforce",
    clientBillingSchedule: cleanClient,
    clientDeliverySchedule: auth.deliverySchedule,
    authoritative: auth,
    meta: { mba_number: "MBA-FIX", version: 1 },
  })

  assert.equal(off.billingSchedule, cleanClient)
  assert.equal(log.billingSchedule, cleanClient)
  assert.equal(enforce.billingSchedule, auth.billingSchedule)
  assertScheduleMoneyEqual(off.billingSchedule, log.billingSchedule, "off vs log")
  assertScheduleMoneyEqual(log.billingSchedule, enforce.billingSchedule, "log vs enforce")
  assert.equal(log.diffLogged, false)
})

test("enforce persist shape retains per-line lineItems (S1-P1b regression)", () => {
  const lineItems = mixedFixtureLineItems()
  const auth = computeAuthoritativeFinancials({
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

  assert.ok(
    billingMonthsHaveDetailedLineItems(auth.billingSchedule),
    "authoritative billing must carry line detail before enforce"
  )
  assert.ok(
    billingMonthsHaveDetailedLineItems(auth.deliverySchedule),
    "authoritative delivery must carry line detail before enforce"
  )

  // Simulate a header-only client schedule (the pre-fix hole): totals only, no lineItems.
  const headerOnlyClient: BillingMonth[] = auth.billingSchedule.map((m) => {
    const { lineItems: _drop, ...rest } = m
    return { ...rest, mediaCosts: { ...m.mediaCosts } }
  })
  assert.equal(
    billingMonthsHaveDetailedLineItems(headerOnlyClient),
    false,
    "precondition: header-only client has no line detail"
  )

  const enforce = applyPlanCServerAuthority({
    mode: "enforce",
    clientBillingSchedule: headerOnlyClient,
    clientDeliverySchedule: auth.deliverySchedule.map((m) => {
      const { lineItems: _drop, ...rest } = m
      return { ...rest, mediaCosts: { ...m.mediaCosts } }
    }),
    authoritative: auth,
    meta: { mba_number: "MBA-LINEDETAIL", version: 9 },
  })

  assert.equal(enforce.billingSchedule, auth.billingSchedule)
  assert.ok(
    billingMonthsHaveDetailedLineItems(enforce.billingSchedule),
    "enforce must persist server schedule WITH lineItems — not strip them"
  )
  assert.ok(
    billingMonthsHaveDetailedLineItems(enforce.deliverySchedule),
    "enforce delivery must retain lineItems"
  )

  const june = enforce.billingSchedule.find((m) => m.monthYear === "June 2026")!
  const ids = new Set<string>()
  for (const items of Object.values(june.lineItems ?? {})) {
    for (const item of items ?? []) ids.add(item.id)
  }
  for (const id of [
    "AUTO-SEARCH",
    "MANUAL-SOCIAL",
    "CLIENT-PAYS-TV",
    "ADSERV-DISPLAY",
    "PROD-1",
  ]) {
    assert.ok(ids.has(id), `enforce schedule missing ${id}`)
  }
})

test("enforce corrects a deliberately drifted client schedule", () => {
  const lineItems = mixedFixtureLineItems()
  const auth = computeAuthoritativeFinancials({
    lineItems,
    feeLoading: FEE_LOADING,
    overrides: MANUAL_OVERRIDE_ROWS,
    monthScope: {
      campaignStart: new Date("2026-06-01"),
      campaignEnd: new Date("2026-07-31"),
    },
  })
  const drifted = driftClientSchedule(auth.billingSchedule)

  const enforce = applyPlanCServerAuthority({
    mode: "enforce",
    clientBillingSchedule: drifted,
    clientDeliverySchedule: auth.deliverySchedule,
    authoritative: auth,
    meta: { mba_number: "MBA-DRIFT", version: 2 },
  })

  assert.equal(enforce.billingSchedule, auth.billingSchedule)
  assertScheduleMoneyEqual(enforce.billingSchedule, auth.billingSchedule, "enforce=server")
  const juneClient = monthMoney(drifted[0]!.mediaTotal)
  const junePersisted = monthMoney(enforce.billingSchedule[0]!.mediaTotal)
  assert.ok(Math.abs(juneClient - junePersisted) > 0.01, "drift was present on client")
})

test("log emits [planc-authority-diff] when client schedule drifts", () => {
  const lineItems = mixedFixtureLineItems()
  const auth = computeAuthoritativeFinancials({
    lineItems,
    feeLoading: FEE_LOADING,
    overrides: MANUAL_OVERRIDE_ROWS,
    monthScope: {
      campaignStart: new Date("2026-06-01"),
      campaignEnd: new Date("2026-07-31"),
    },
  })
  const drifted = driftClientSchedule(auth.billingSchedule)

  const lines: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "))
  }
  try {
    const log = applyPlanCServerAuthority({
      mode: "log",
      clientBillingSchedule: drifted,
      clientDeliverySchedule: auth.deliverySchedule,
      authoritative: auth,
      meta: { mba_number: "MBA-LOG", version: 3 },
    })
    assert.equal(log.billingSchedule, drifted)
    assert.equal(log.diffLogged, true)
  } finally {
    console.log = originalLog
  }

  const diffLine = lines.find((l) => l.includes("[planc-authority-diff]"))
  assert.ok(diffLine, `expected diff log; got ${JSON.stringify(lines)}`)
  assert.ok(diffLine!.includes("MBA-LOG"))
  assert.ok(diffLine!.includes("version"))
})

test("manual line months identical between log and enforce (overrides inside authority)", () => {
  const lineItems = [manualSocial(), autoSearch()]
  const auth = computeAuthoritativeFinancials({
    lineItems,
    feeLoading: FEE_LOADING,
    overrides: MANUAL_OVERRIDE_ROWS,
    monthScope: {
      campaignStart: new Date("2026-06-01"),
      campaignEnd: new Date("2026-07-31"),
    },
  })

  const manual = auth.perLine.find((p) => p.lineItemId === "MANUAL-SOCIAL")
  assert.ok(manual)
  assert.equal(manual!.flags.manualBilling, true)
  assert.deepEqual(
    manual!.billingMonths.map((m) => ({ month: m.month, amount: m.amount })),
    [
      { month: "June 2026", amount: 6_000 },
      { month: "July 2026", amount: 0 },
    ]
  )

  // Client schedule mirrors authority money but carries manual stamps (C1 keep-client path).
  const clientSchedule = JSON.parse(JSON.stringify(auth.billingSchedule)) as BillingMonth[]

  const log = applyPlanCServerAuthority({
    mode: "log",
    clientBillingSchedule: clientSchedule,
    clientDeliverySchedule: auth.deliverySchedule,
    authoritative: auth,
    meta: { mba_number: "MBA-MANUAL", version: 1 },
  })
  const enforce = applyPlanCServerAuthority({
    mode: "enforce",
    clientBillingSchedule: clientSchedule,
    clientDeliverySchedule: auth.deliverySchedule,
    authoritative: auth,
    meta: { mba_number: "MBA-MANUAL", version: 1 },
  })

  // Recompute under both modes must keep the same manual month vector.
  const authAgain = computeAuthoritativeFinancials({
    lineItems,
    feeLoading: FEE_LOADING,
    overrides: MANUAL_OVERRIDE_ROWS,
    monthScope: {
      campaignStart: new Date("2026-06-01"),
      campaignEnd: new Date("2026-07-31"),
    },
  })
  assert.deepEqual(
    auth.perLine.find((p) => p.lineItemId === "MANUAL-SOCIAL")!.billingMonths,
    authAgain.perLine.find((p) => p.lineItemId === "MANUAL-SOCIAL")!.billingMonths
  )

  assertScheduleMoneyEqual(log.billingSchedule, enforce.billingSchedule, "manual log vs enforce")
  const juneLog = monthMoney(log.billingSchedule.find((m) => m.monthYear === "June 2026")?.mediaTotal)
  const juneEnforce = monthMoney(
    enforce.billingSchedule.find((m) => m.monthYear === "June 2026")?.mediaTotal
  )
  assert.equal(juneLog, juneEnforce)
})

test("diffClientVsAuthoritySchedule: empty when within $0.01", () => {
  const auth = computeAuthoritativeFinancials({
    lineItems: [autoSearch()],
    feeLoading: FEE_LOADING,
    overrides: [],
  })
  const diff = diffClientVsAuthoritySchedule(auth.billingSchedule, auth)
  assert.equal(diff, null)
})

test("parsePersistedBillingScheduleToMonths round-trips authority billingSchedule", async () => {
  const { parsePersistedBillingScheduleToMonths } = await import(
    "@/lib/billing/parsePersistedBillingScheduleToMonths.js"
  )
  const auth = computeAuthoritativeFinancials({
    lineItems: mixedFixtureLineItems(),
    feeLoading: FEE_LOADING,
    overrides: MANUAL_OVERRIDE_ROWS,
    monthScope: {
      campaignStart: new Date("2026-06-01"),
      campaignEnd: new Date("2026-07-31"),
    },
  })
  const roundTripped = parsePersistedBillingScheduleToMonths(auth.billingSchedule)
  assert.ok(roundTripped)
  assertScheduleMoneyEqual(auth.billingSchedule, roundTripped!, "authority round-trip")
})
