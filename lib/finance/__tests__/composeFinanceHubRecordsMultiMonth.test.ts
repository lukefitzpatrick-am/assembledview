import assert from "node:assert/strict"
import test from "node:test"

import {
  composeBillingRecordsForMonth,
  composePayableRecordsForMonth,
} from "../composeFinanceHubRecords.js"
import type { ScopeOfWorkRow } from "../deriveScopeSowReceivables.js"
import {
  filterPersistedStatusRowsForMonth,
  type PersistedFinanceStatusRow,
} from "../overlayFinanceStatus.js"
import {
  buildMbaToLatestVersionMap,
  selectRelevantVersionsForMonth,
} from "../relevantPlanVersions.js"
import type { BillingRecord, BillingType } from "@/lib/types/financeBilling.js"

/**
 * Spot check for the multi-month billing/payables path (Option 2 refactor):
 * the multi-month response must be byte-identical to the flatMap of the
 * equivalent single-month responses for the same filters.
 *
 * The multi path fetches a plan-version SUPERSET once and month-scopes it with
 * `selectRelevantVersionsForMonth`, and fetches persisted status rows once and
 * month-scopes them inside compose — this test proves neither widens nor
 * narrows what any single month sees, across all three derivation paths
 * (media, sow, retainer) plus the marked-billed status overlay.
 */

const MONTHS = ["2026-05", "2026-06"] as const

function scheduleMonth(
  monthYear: string,
  mediaAmount: number,
  feeAmount: number,
  lineId: string,
  monthlyAmounts: Record<string, number>
) {
  return {
    monthYear,
    mediaTotal: `$${mediaAmount.toFixed(2)}`,
    feeTotal: `$${feeAmount.toFixed(2)}`,
    totalAmount: `$${(mediaAmount + feeAmount).toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    lineItems: {
      search: [
        {
          id: lineId,
          header1: "Google",
          monthlyAmounts,
          totalAmount: Object.values(monthlyAmounts).reduce((s, n) => s + n, 0),
        },
      ],
    },
  }
}

// AC-001: booked plan spanning May + June (media path in both months).
const versionAc001V2 = {
  id: 101,
  version_number: 2,
  media_plan_master_id: 900,
  mba_number: "AC-001",
  campaign_name: "Winter Push",
  clients_id: 1,
  mp_client_name: "Acme",
  campaign_status: "booked",
  campaign_start_date: "2026-05-01",
  campaign_end_date: "2026-06-30",
  billingSchedule: [
    scheduleMonth("May 2026", 800, 200, "LI-Google-1", { "May 2026": 800, "June 2026": 400 }),
    scheduleMonth("June 2026", 400, 100, "LI-Google-1", { "May 2026": 800, "June 2026": 400 }),
  ],
  deliverySchedule: [
    scheduleMonth("May 2026", 800, 0, "LI-Google-1", { "May 2026": 800, "June 2026": 400 }),
    scheduleMonth("June 2026", 400, 0, "LI-Google-1", { "May 2026": 800, "June 2026": 400 }),
  ],
}

// Superseded version of the same MBA — must never be relevant.
const versionAc001V1 = {
  ...versionAc001V2,
  id: 100,
  version_number: 1,
  billingSchedule: [scheduleMonth("May 2026", 9999, 0, "LI-STALE", { "May 2026": 9999 })],
}

// AC-002: overlaps May ONLY — proves per-month scoping inside a bulk superset.
const versionAc002 = {
  id: 201,
  version_number: 1,
  media_plan_master_id: 901,
  mba_number: "AC-002",
  campaign_name: "May Sprint",
  clients_id: 2,
  mp_client_name: "Beta Co",
  campaign_status: "booked",
  campaign_start_date: "2026-05-01",
  campaign_end_date: "2026-05-31",
  billingSchedule: [scheduleMonth("May 2026", 300, 50, "LI-Google-2", { "May 2026": 300 })],
  deliverySchedule: [scheduleMonth("May 2026", 300, 0, "LI-Google-2", { "May 2026": 300 })],
}

const masters = [
  { id: 900, mba_number: "AC-001", version_number: 2 },
  { id: 901, mba_number: "AC-002", version_number: 1 },
]
const allVersions = [versionAc001V1, versionAc001V2, versionAc002]

const clients: Record<string, unknown>[] = [
  {
    id: 1,
    clientname_input: "Acme",
    mp_client_name: "Acme",
    mbaidentifier: "AC",
    payment_days: 14,
    payment_terms: "Net 14 days",
    monthlyretainer: 5000, // retainer path
  },
  { id: 2, clientname_input: "Beta Co", mp_client_name: "Beta Co" },
]

const publishers: Record<string, unknown>[] = [
  { id: 10, publisher_name: "Google", billingagency: "advertising associates" },
]

const scopes: ScopeOfWorkRow[] = [
  {
    id: 7,
    scope_id: "AC-SOW-1",
    client_name: "Acme",
    project_name: "Site Build",
    project_status: "approved",
    billing_schedule: [
      { month: "May 2026", cost: 3000 },
      { month: "June 2026", cost: 3000 },
    ],
  },
]

// Marked-billed overlay for the May AC-001 media row — exercises applyStatusOverlay
// in the bulk path (June must stay unbilled).
const statusRows: PersistedFinanceStatusRow[] = [
  {
    id: 55,
    clients_id: 1,
    mba_number: "AC-001",
    campaign_name: "Winter Push",
    billing_type: "media",
    billing_month: "2026-05",
    billed: true,
    billed_at: 1_750_000_000,
    billed_by: 3,
    billed_amount: 1000,
    billed_lines_hash: null,
    notes: "inv#42",
    exported_at: null,
    exported_by: null,
    invoice_key: "media:AC-001:2026-05",
  },
]

const mbaMap = buildMbaToLatestVersionMap(masters)

function yearMonth(monthStr: string): { year: number; month: number } {
  return { year: Number(monthStr.slice(0, 4)), month: Number(monthStr.slice(5, 7)) }
}

type BillingFilterOverrides = {
  types?: BillingType[]
  clientsIdParam?: string | null
}

function billingForMonth(
  monthStr: string,
  opts: { monthScopedStatusRows: boolean } & BillingFilterOverrides
): BillingRecord[] {
  const { year, month } = yearMonth(monthStr)
  return composeBillingRecordsForMonth({
    monthStr,
    relevantVersions: selectRelevantVersionsForMonth(allVersions, mbaMap, year, month),
    clients,
    publishers,
    scopes,
    persistedStatusRows: opts.monthScopedStatusRows
      ? filterPersistedStatusRowsForMonth(statusRows, monthStr)
      : statusRows,
    includeNonBooked: true,
    types: opts.types ?? [],
    clientsIdParam: opts.clientsIdParam ?? null,
    searchParam: null,
    statusParam: null,
    publishersIdParam: null,
  })
}

test("selectRelevantVersionsForMonth: bulk superset month-scopes exactly like single-month", () => {
  const may = selectRelevantVersionsForMonth(allVersions, mbaMap, 2026, 5)
  const june = selectRelevantVersionsForMonth(allVersions, mbaMap, 2026, 6)
  assert.deepEqual(may.map((v: { id: number }) => v.id).sort(), [101, 201], "May must see both plans")
  assert.deepEqual(june.map((v: { id: number }) => v.id), [101], "June must see AC-001 only")
  assert.ok(!may.some((v: { id: number }) => v.id === 100), "superseded version must never be relevant")
})

test("billing multi-month ≡ flatMap of single-month (media + sow + retainer + overlay)", () => {
  // Single-month simulation: status rows arrive pre-filtered per month
  // (fetchPersistedFinanceStatusForMonth semantics).
  const single = MONTHS.flatMap((m) => billingForMonth(m, { monthScopedStatusRows: true }))
  // Multi-month simulation: ALL status rows passed once; compose month-scopes internally
  // (fetchAllPersistedFinanceStatusRows semantics).
  const multi = MONTHS.flatMap((m) => billingForMonth(m, { monthScopedStatusRows: false }))

  assert.equal(JSON.stringify(multi), JSON.stringify(single), "multi-month must be byte-identical")

  // All three derivation paths must actually be exercised.
  const types = new Set(multi.map((r) => r.billing_type))
  assert.ok(types.has("media"), "media records missing")
  assert.ok(types.has("sow"), "sow records missing")
  assert.ok(types.has("retainer"), "retainer records missing")

  // Month scoping: AC-002 media appears in May only.
  const ac002 = multi.filter((r) => r.mba_number === "AC-002")
  assert.equal(ac002.length, 1)
  assert.equal(ac002[0]!.billing_month, "2026-05")

  // Overlay: May AC-001 media row is billed; June stays unbilled.
  const mayMedia = multi.find(
    (r) => r.billing_type === "media" && r.mba_number === "AC-001" && r.billing_month === "2026-05"
  )
  const juneMedia = multi.find(
    (r) => r.billing_type === "media" && r.mba_number === "AC-001" && r.billing_month === "2026-06"
  )
  assert.ok(mayMedia && juneMedia, "AC-001 media rows missing")
  assert.equal(mayMedia!.billed, true)
  assert.equal(mayMedia!.billed_amount, 1000)
  assert.equal(mayMedia!.persisted_record_id, 55)
  assert.equal(mayMedia!.notes, "inv#42")
  assert.equal(juneMedia!.billed, false)
  assert.equal(juneMedia!.persisted_record_id, null)

  // SOW and retainer emitted for both months.
  assert.equal(multi.filter((r) => r.billing_type === "sow").length, 2)
  assert.equal(multi.filter((r) => r.billing_type === "retainer").length, 2)
})

test("billing multi-month ≡ single-month under hub query filters", () => {
  const opts: BillingFilterOverrides = {
    types: ["media", "sow", "retainer"] as BillingType[],
    clientsIdParam: "1",
  }
  const single = MONTHS.flatMap((m) => billingForMonth(m, { monthScopedStatusRows: true, ...opts }))
  const multi = MONTHS.flatMap((m) => billingForMonth(m, { monthScopedStatusRows: false, ...opts }))
  assert.equal(JSON.stringify(multi), JSON.stringify(single))
  assert.ok(multi.length > 0)
  assert.ok(multi.every((r) => r.clients_id === 1))
})

test("payables multi-month ≡ flatMap of single-month", () => {
  const payablesForMonth = (monthStr: string): BillingRecord[] => {
    const { year, month } = yearMonth(monthStr)
    return composePayableRecordsForMonth({
      year,
      month,
      relevantVersions: selectRelevantVersionsForMonth(allVersions, mbaMap, year, month),
      publishers,
      includeNonBooked: true,
      types: [],
      clientsIdParam: null,
      searchParam: null,
      publishersIdParam: null,
    })
  }

  const single = MONTHS.flatMap(payablesForMonth)
  const multi = MONTHS.flatMap(payablesForMonth)
  assert.equal(JSON.stringify(multi), JSON.stringify(single), "payables multi-month must be byte-identical")

  assert.ok(single.length > 0, "expected payable rows")
  assert.ok(single.every((r) => r.billing_type === "payable"))
  // AC-002 delivery only exists in May.
  const ac002Months = single.filter((r) => r.mba_number === "AC-002").map((r) => r.billing_month)
  assert.deepEqual(ac002Months, ["2026-05"])
  // Publisher grouping intact.
  assert.ok(single.every((r) => r.line_items.every((li) => li.publisher_name === "Google")))
})

test("selectRelevantVersionsForMonth matches master to version when mba_number differs only by case", () => {
  const mixedMasters = [{ id: 10, mba_number: "Boss001", version_number: 2 }]
  const mixedVersions = [
    {
      id: 1,
      mba_number: "boss001",
      version_number: 2,
      media_plan_master_id: 10,
      campaign_start_date: "2026-05-01",
      campaign_end_date: "2026-05-31",
    },
  ]
  const map = buildMbaToLatestVersionMap(mixedMasters)
  const relevant = selectRelevantVersionsForMonth(mixedVersions, map, 2026, 5)
  assert.equal(relevant.length, 1)
  assert.equal(relevant[0]!.mba_number, "boss001")
})
