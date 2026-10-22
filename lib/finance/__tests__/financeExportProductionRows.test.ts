import assert from "node:assert/strict"
import test from "node:test"

import {
  buildProductionServiceRows,
  productionLineMonthAmounts,
} from "@/lib/finance/financeExportProductionRows"
import { sumCents, toCents } from "@/lib/money"

const AA = new Set(["SCA", "Southern Cross Austereo"])
const billsViaAA = (name: string) => AA.has(name)

function total(rows: { amount: number }[]): number {
  return sumCents(rows.map((r) => toCents(r.amount)))
}

test("one code only keeps the full production under that code", () => {
  assert.deepEqual(
    buildProductionServiceRows({
      production: 2650,
      hasAdvertisingAssociates: true,
      hasAssembledMedia: false,
      lineAmounts: [],
      billsViaAdvertisingAssociates: billsViaAA,
    }),
    [{ itemCode: "G.Production", service: "Production", amount: 2650 }],
  )
  assert.deepEqual(
    buildProductionServiceRows({
      production: 2650,
      hasAdvertisingAssociates: false,
      hasAssembledMedia: true,
      lineAmounts: [],
      billsViaAdvertisingAssociates: billsViaAA,
    }),
    [{ itemCode: "D.Production", service: "Production", amount: 2650 }],
  )
  assert.deepEqual(
    buildProductionServiceRows({
      production: 2650,
      hasAdvertisingAssociates: false,
      hasAssembledMedia: false,
      lineAmounts: [],
      billsViaAdvertisingAssociates: billsViaAA,
    }),
    [],
  )
})

test("both codes split production by production publisher (golf009 Feb 2026 shape)", () => {
  // Old Xano bursts: cost on a one-day burst.
  const lineAmounts = productionLineMonthAmounts({
    billingSchedule: [{ monthYear: "February 2026", production: "$2,650.00" }],
    year: 2026,
    month: 2,
    lines: [
      {
        lineItemId: "golf009-production-v438-p1",
        publisher: "SCA",
        bursts: [{ cost: 850, amount: 1, startDate: "2026-02-27", endDate: "2026-02-27" }],
      },
      {
        lineItemId: "golf009-production-v438-p2",
        publisher: "QMS",
        bursts: [{ cost: 1800, amount: 1, startDate: "2026-02-02", endDate: "2026-02-02" }],
      },
    ],
  })
  assert.deepEqual(
    lineAmounts.map((l) => l.amount),
    [850, 1800],
  )
  const rows = buildProductionServiceRows({
    production: 2650,
    hasAdvertisingAssociates: true,
    hasAssembledMedia: true,
    lineAmounts,
    billsViaAdvertisingAssociates: billsViaAA,
  })
  assert.deepEqual(rows, [
    { itemCode: "G.Production", service: "Production", amount: 850 },
    { itemCode: "D.Production", service: "Production", amount: 1800 },
  ])
  assert.equal(total(rows), toCents(2650))
})

test("split rows always sum to the month production", () => {
  const rows = buildProductionServiceRows({
    production: 100,
    hasAdvertisingAssociates: true,
    hasAssembledMedia: true,
    lineAmounts: [
      { lineItemId: "a", publisher: "SCA", amount: 1 },
      { lineItemId: "b", publisher: "QMS", amount: 1 },
      { lineItemId: "c", publisher: "Nine", amount: 1 },
    ],
    billsViaAdvertisingAssociates: billsViaAA,
  })
  assert.equal(rows[0]!.amount, 33.33)
  assert.equal(rows[1]!.amount, 66.67)
  assert.equal(total(rows), toCents(100))
})

test("production with lines on one side goes to that side only", () => {
  const onlyAa = buildProductionServiceRows({
    production: 500,
    hasAdvertisingAssociates: true,
    hasAssembledMedia: true,
    lineAmounts: [{ lineItemId: "a", publisher: "SCA", amount: 200 }],
    billsViaAdvertisingAssociates: billsViaAA,
  })
  assert.deepEqual(onlyAa, [{ itemCode: "G.Production", service: "Production", amount: 500 }])
})

test("no production lines this month puts the full amount under D, never both", () => {
  const rows = buildProductionServiceRows({
    production: 750,
    hasAdvertisingAssociates: true,
    hasAssembledMedia: true,
    lineAmounts: [{ lineItemId: "a", publisher: "SCA", amount: 0 }],
    billsViaAdvertisingAssociates: billsViaAA,
  })
  assert.deepEqual(rows, [{ itemCode: "D.Production", service: "Production", amount: 750 }])
})

test("per-line production on the billing blob wins over bursts", () => {
  const billingSchedule = [
    {
      monthYear: "December 2026",
      production: "$16,301.37",
      lineItems: {
        production: [
          { id: "PENFOLD020PROD1", monthlyAmounts: { "December 2026": 11995.09 } },
          { id: "PENFOLD020PROD4", monthlyAmounts: { "December 2026": 4306.28 } },
        ],
      },
    },
  ]
  const amounts = productionLineMonthAmounts({
    billingSchedule,
    year: 2026,
    month: 12,
    lines: [
      { lineItemId: "PENFOLD020PROD1", publisher: "Revolution 360", bursts: [] },
      {
        lineItemId: "PENFOLD020PROD4",
        publisher: "SCA",
        bursts: [{ budget: 99999, startDate: "2026-12-01", endDate: "2026-12-31" }],
      },
    ],
  })
  assert.deepEqual(
    amounts.map((a) => a.amount),
    [11995.09, 4306.28],
  )
})

test("old bursts weigh cost x amount (CHALLEN003 shape)", () => {
  const amounts = productionLineMonthAmounts({
    billingSchedule: [],
    year: 2025,
    month: 7,
    lines: [
      {
        lineItemId: "x-p1",
        publisher: "SCA",
        bursts: [{ cost: 700, amount: 2, startDate: "2025-07-12", endDate: "2025-08-08" }],
      },
      {
        lineItemId: "x-p2",
        publisher: "QMS",
        bursts: [{ cost: 700, amount: 1, startDate: "2025-07-12", endDate: "2025-08-08" }],
      },
    ],
  })
  assert.ok(Math.abs(amounts[0]!.amount - 2 * amounts[1]!.amount) <= 0.01)
  assert.ok(amounts[0]!.amount > 0)
})
