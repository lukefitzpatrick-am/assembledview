/**
 * PC1 — schedule_months as finance derive source (pure rebuild + flag fallback).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { explodeScheduleToMonthRows } from "../../../scripts/migration/_scheduleTransform.js"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths.js"
import { monthExGstFromScheduleEntry } from "../computeBillableAlignedMbaTotal.js"
import { computeCampaignFinancials } from "../computeCampaignFinancials.js"
import type { LineItemInput } from "../campaignFinancials.types.js"
import {
  buildSchedulesFromMonthRows,
  centsToDollars,
  compareScheduleMonthAmounts,
  getFinanceScheduleBackend,
  mediaTypeFromScheduleLineId,
  resolveVersionSchedules,
  type ScheduleMonthRowInput,
} from "../scheduleMonthsSource.js"

function boss001StyleFixture(): LineItemInput[] {
  return [
    {
      lineItemId: "billing-search::BOSS001SEA001",
      mediaType: "search",
      buyType: "cpc",
      rate: 2,
      enteredAmount: 10_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 20,
      label: "Google | Brand",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-06-30",
          budget: 10_000,
          buyAmount: 2,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "billing-progDisplay::BOSS001PD001",
      mediaType: "progDisplay",
      buyType: "cpm",
      rate: 10,
      enteredAmount: 5_000,
      budgetIncludesFees: false,
      clientPaysForMedia: true,
      feePct: 15,
      label: "DV360 | ROAS",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: 5_000,
          buyAmount: 10,
          deliverables: 500_000,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "billing-production::BOSS001PRD001",
      mediaType: "production",
      buyType: "fixed_cost",
      rate: 0,
      enteredAmount: 1_200,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 0,
      label: "Assets",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: 1_200,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "billing-socialMedia::BOSS001SOC001",
      mediaType: "socialMedia",
      buyType: "cpm",
      rate: 8,
      enteredAmount: 4_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 10,
      label: "Meta | Prospecting",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-06-30",
          budget: 4_000,
          buyAmount: 8,
        },
      ],
      approval: "approved",
      billingOverride: {
        mode: "manual",
        reason: "prepayment",
        dateBasis: "test",
        months: [{ month: "2026-05", amount: 4_000 }],
      },
    },
  ]
}

function explodeBoth(versionId: number, financials: ReturnType<typeof computeCampaignFinancials>) {
  const billing = explodeScheduleToMonthRows(versionId, "billing", financials.billingSchedule)
  const delivery = explodeScheduleToMonthRows(versionId, "delivery", financials.deliverySchedule)
  assert.equal(billing.failureReason, null)
  assert.equal(delivery.failureReason, null)
  const rows: ScheduleMonthRowInput[] = [...billing.rows, ...delivery.rows].map((r) => ({
    versionId: r.versionId,
    lineItemId: r.lineItemId,
    component: r.component,
    basis: r.basis,
    month: r.month,
    amountCents: r.amountCents,
    source: r.source,
  }))
  return rows
}

test("centsToDollars is the only cents→dollars boundary helper", () => {
  assert.equal(centsToDollars(10_050), 100.5)
  assert.equal(centsToDollars(1), 0.01)
  assert.equal(centsToDollars(0), 0)
})

test("getFinanceScheduleBackend defaults to blob", () => {
  const prev = process.env.DATA_BACKEND_FINANCE_SCHEDULE
  delete process.env.DATA_BACKEND_FINANCE_SCHEDULE
  try {
    assert.equal(getFinanceScheduleBackend(), "blob")
  } finally {
    if (prev === undefined) delete process.env.DATA_BACKEND_FINANCE_SCHEDULE
    else process.env.DATA_BACKEND_FINANCE_SCHEDULE = prev
  }
})

test("golden: clean+override+client-pays round-trip via explode → rebuild", () => {
  const financials = computeCampaignFinancials(boss001StyleFixture(), { feeLoading: {} })
  const rows = explodeBoth(42, financials)
  // Mark override rows the way savePlan reconcileOverrideSources would.
  for (const r of rows) {
    if (r.lineItemId === "billing-socialMedia::BOSS001SOC001" && r.component === "media") {
      r.source = "override"
    }
  }

  const rebuilt = buildSchedulesFromMonthRows(rows)
  assert.ok(rebuilt.billing.length > 0)
  assert.ok(rebuilt.delivery.length > 0)

  const mayBill = rebuilt.billing.find((m) => m.monthYear === "May 2026")
  assert.ok(mayBill)

  // Client-pays: fee on billing, media 0 (or absent).
  const pd = mayBill!.lineItems?.progDisplay?.find(
    (li) => li.id === "billing-progDisplay::BOSS001PD001"
  )
  assert.ok(pd)
  assert.equal(pd!.monthlyAmounts["May 2026"] ?? 0, 0)
  assert.ok((pd!.feeMonthlyAmounts?.["May 2026"] ?? 0) > 0)

  // Override → manual billing mode.
  const soc = mayBill!.lineItems?.socialMedia?.find(
    (li) => li.id === "billing-socialMedia::BOSS001SOC001"
  )
  assert.ok(soc)
  assert.equal(soc!.billingMode, "manual")
  assert.equal(soc!.monthlyAmounts["May 2026"], 4_000)

  // Header totals reconcile from row sums (record total stays month-header ex-GST).
  const headerEx = monthExGstFromScheduleEntry(mayBill! as unknown as Record<string, unknown>)
  assert.ok(headerEx > 0)

  // Shadow compare vs original blob parse within $0.01.
  const diffs = compareScheduleMonthAmounts({
    versionId: 42,
    blobBilling: financials.billingSchedule,
    blobDelivery: financials.deliverySchedule,
    rowsBilling: rebuilt.billing,
    rowsDelivery: rebuilt.delivery,
  })
  assert.equal(diffs.length, 0, `unexpected diffs: ${JSON.stringify(diffs.slice(0, 5))}`)
})

test("golden: ZERO schedule_months rows falls back to blob parse", () => {
  const financials = computeCampaignFinancials(
    [
      {
        lineItemId: "billing-search::FALLBACK001",
        mediaType: "search",
        buyType: "cpc",
        rate: 1,
        enteredAmount: 500,
        budgetIncludesFees: false,
        clientPaysForMedia: false,
        feePct: 10,
        label: "Fallback",
        bursts: [
          {
            startDate: "2026-07-01",
            endDate: "2026-07-31",
            budget: 500,
            buyAmount: 1,
          },
        ],
        approval: "approved",
      },
    ],
    { feeLoading: {} }
  )

  const version = {
    id: 99,
    billingSchedule: financials.billingSchedule,
    deliverySchedule: financials.deliverySchedule,
  }

  const resolved = resolveVersionSchedules(version, [])
  assert.equal(resolved.fallbackUsed, true)
  assert.ok(resolved.billing.length > 0)

  const blobOnly = parsePersistedBillingScheduleToMonths(financials.billingSchedule) ?? []
  assert.equal(resolved.billing.length, blobOnly.length)
  assert.equal(resolved.billing[0]!.monthYear, blobOnly[0]!.monthYear)
})

test("golden: rows path serves rebuilt schedules when rows exist", () => {
  const financials = computeCampaignFinancials(boss001StyleFixture(), { feeLoading: {} })
  const rows = explodeBoth(7, financials)
  const version = {
    id: 7,
    billingSchedule: financials.billingSchedule,
    deliverySchedule: financials.deliverySchedule,
  }
  const resolved = resolveVersionSchedules(version, rows)
  assert.equal(resolved.fallbackUsed, false)
  assert.ok(resolved.billing.some((m) => m.monthYear === "May 2026"))
})

test("mediaTypeFromScheduleLineId: decorated, service, bare, legacy ETL, unknown", () => {
  const cases: Array<[string, string | null]> = [
    ["billing-search::X1", "search"],
    ["billing-progDisplay::X1", "progDisplay"],
    ["billing-bogus::X1", "search"],
    ["__service__adserving", null],
    ["__service__fees", null],
    ["hartm001SE1", "search"],
    ["hartm001PD3", "progDisplay"],
    ["hartm001PV2", "progVideo"],
    ["hartm001SM1", "socialMedia"],
    ["golf025OH12", "ooh"],
    ["BOSS010RA4", "radio"],
    ["BICAU002DD2", "digiDisplay"],
    ["TheY001NP1", "newspaper"],
    ["PGAAUS015BV1", "bvod"],
    ["PENFOLD016PO3", "progOoh"],
    ["BOSS011TV2", "television"],
    ["curatif004DV1", "digiVideo"],
    ["hartm013PROD1", "production"],
    ["glenda006PB1", "progBvod"],
    ["CHALLEN005IN1", "influencers"],
    ["search-Google Ads - AM-maximize_conversions-0", "search"],
    ["socialMedia-Meta-Medical and Beauty Professionals-0", "socialMedia"],
    ["radio-Southern Cross Austereo-Triple M Melbourne 105.1-4", "radio"],
    ["digiDisplay-Realestate.com.au-realestate.com.au-7", "digiDisplay"],
    ["progVideo-YouTube - DV360-Details-1", "progVideo"],
    ["totally-unknown-shape", "search"],
  ]
  for (const [id, expected] of cases) {
    assert.equal(mediaTypeFromScheduleLineId(id), expected, id)
  }
})
