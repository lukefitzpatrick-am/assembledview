/**
 * B31fix L6: a dated bill-cost line (Channel Factory, AA, direct publishers)
 * says it is not split, on the line, the page and the Excel flags column. The
 * Excel "Fixed cost legs" sheet lists it whole ("Not split (bills)"), so the
 * sheet ties to the dated lines' totals in the report.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  BILLS_NOT_SPLIT_LEG_LABEL,
  composeFixedCostMargin,
  fixedCostFromLineLabel,
  lineFlagLabels,
  summariseFixedCostMargin,
  totalsForLines,
  type FixedCostMarginLine,
  type FixedCostPlanCell,
  type LineBillCostCell,
} from "../compose.js"
import { buildFixedCostMarginWorkbookBytes, LEGS_SHEET_TOTAL_LABEL } from "../excel.js"
import { BOSS_FROM, BOSS_RANGE, bossPlan, bossPreDateSpend, bossSpend } from "./fixtures/bossFc9.js"

function cfPlan(from?: string): FixedCostPlanCell[] {
  const base = bossPlan()[0]!
  return ["2026-09", "2026-10", "2026-11"].map((month) => {
    const cell: FixedCostPlanCell = {
      ...base,
      mbaNumber: "BOSS010",
      lineItemId: "BOSS010PV1",
      publisher: "Channel Factory",
      platform: "Channel Factory",
      costBasis: "xero_bill",
      month,
      amountCents: 500000,
    }
    if (from) cell.fixedCostFrom = from
    return cell
  })
}

function cfBill(month: string, net: number, status = "AUTHORISED"): LineBillCostCell {
  return {
    lineItemId: "boss010pv1",
    month,
    basis: "billed",
    countedGrossCents: status === "AUTHORISED" ? net : 0,
    countedRebateCents: 0,
    countedNetCents: status === "AUTHORISED" ? net : 0,
    pendingNetCents: status === "AUTHORISED" ? 0 : net,
    methods: ["cf_placement"],
    statuses: [status],
    supplierKinds: ["channel_factory"],
  }
}

/** BOSS four (dated), a dated CF bill line, and an undated CF line on another MBA. */
function mixed(dated: boolean): FixedCostMarginLine[] {
  const from = dated ? BOSS_FROM : undefined
  const undated = cfPlan().map((c) => ({ ...c, mbaNumber: "BOSS099", lineItemId: "BOSS099PV1" }))
  return composeFixedCostMargin({
    plan: [...bossPlan(from), ...cfPlan(from), ...undated],
    spend: bossSpend(),
    invoiced: new Set(),
    ...BOSS_RANGE,
    // Sep counted, Oct pending only (no margin), Nov counted.
    billCosts: [
      cfBill("2026-09", 410000),
      cfBill("2026-10", 380000, "DRAFT"),
      cfBill("2026-11", 450000),
      { ...cfBill("2026-09", 400000), lineItemId: "boss099pv1" },
    ],
    ...(dated ? { preDateSpendCents: bossPreDateSpend() } : {}),
  })
}

test("label: a dated bill-cost line says not split; a platform line does not", () => {
  assert.equal(
    fixedCostFromLineLabel({ fixedCostFrom: "2026-10-30", costBasis: "xero_bill" }),
    "Fixed cost from 30 Oct 2026 (bills, not split)",
  )
  assert.equal(fixedCostFromLineLabel({ fixedCostFrom: "2026-10-30", costBasis: "platform" }), "Fixed cost from 30 Oct 2026")
  assert.equal(fixedCostFromLineLabel({ costBasis: "xero_bill" }), null)
  const lines = mixed(true)
  const cf = lines.find((l) => l.lineItemId === "BOSS010PV1")!
  assert.equal(lineFlagLabels(cf)[0], "Fixed cost from 30 Oct 2026 (bills, not split)")
  const pd = lines.find((l) => l.lineItemId === "BOSS010PD1")!
  assert.equal(lineFlagLabels(pd)[0], "Fixed cost from 30 Oct 2026")
  assert.ok(!lineFlagLabels(lines.find((l) => l.lineItemId === "BOSS099PV1")!).some((f) => f.startsWith("Fixed cost from")))
})

test("totals: the bill line label moves no figure", () => {
  assert.deepEqual(summariseFixedCostMargin(mixed(true)), summariseFixedCostMargin(mixed(false)))
})

type Row = unknown[]

async function legsRows(lines: FixedCostMarginLine[]): Promise<Row[] | null> {
  const ExcelJS = (await import("exceljs")).default
  const bytes = await buildFixedCostMarginWorkbookBytes(lines, summariseFixedCostMargin(lines), ["n"])
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)
  const ws = wb.getWorksheet("Fixed cost legs")
  if (!ws) return null
  const rows: Row[] = []
  ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)))
  return rows
}

const cents = (v: unknown) => (v == null ? null : Math.round(Number(v) * 100))

test("Excel: the legs sheet lists the dated bill line whole, not split, with its line total", async () => {
  const rows = (await legsRows(mixed(true)))!
  const cf = rows.filter((r) => r[2] === "BOSS010PV1")
  assert.deepEqual(
    cf.map((r) => [r[5], r[6], r[7], r[8], r[9] ?? null]),
    [
      ["2026-09", BILLS_NOT_SPLIT_LEG_LABEL, 5000, 4100, 900],
      ["2026-10", BILLS_NOT_SPLIT_LEG_LABEL, 5000, 0, null],
      ["2026-11", BILLS_NOT_SPLIT_LEG_LABEL, 5000, 4500, 500],
      ["Total", BILLS_NOT_SPLIT_LEG_LABEL, 15000, 8600, 1400],
    ],
  )
  assert.ok(!rows.some((r) => r[2] === "BOSS099PV1"), "undated lines stay out")
})

test("Excel: the legs sheet ties to the report's dated lines (month rows and the total row)", async () => {
  const lines = mixed(true)
  const rows = (await legsRows(lines))!
  const dated = lines.filter((l) => l.fixedCostFrom)
  const report = totalsForLines(dated)
  const monthRows = rows.slice(1).filter((r) => r[5] !== "Total")
  const sumCol = (i: number) => monthRows.reduce<number>((a, r) => a + (cents(r[i]) ?? 0), 0)
  assert.equal(sumCol(7), report.billedCents)
  assert.equal(sumCol(8), report.actualCents)
  assert.equal(sumCol(9), report.marginCents)
  const last = rows[rows.length - 1]!
  assert.equal(last[0], LEGS_SHEET_TOTAL_LABEL)
  assert.deepEqual([cents(last[7]), cents(last[8]), cents(last[9])], [report.billedCents, report.actualCents, report.marginCents])
  // Every line's total rows add to that line's report totals.
  for (const line of dated) {
    const totals = rows.filter((r) => r[2] === line.lineItemId && r[5] === "Total")
    assert.ok(totals.length >= 1, line.lineItemId)
    const b = totals.reduce<number>((a, r) => a + (cents(r[7]) ?? 0), 0)
    const c = totals.reduce<number>((a, r) => a + (cents(r[8]) ?? 0), 0)
    const m = totals.reduce<number>((a, r) => a + (cents(r[9]) ?? 0), 0)
    assert.deepEqual([b, c, m], [line.totals.billedCents, line.totals.actualCents, line.totals.marginCents], line.lineItemId)
  }
})

test("Excel: a report whose only dated line is a bill line still gets the sheet; none without a date", async () => {
  const only = composeFixedCostMargin({
    plan: cfPlan(BOSS_FROM),
    spend: [],
    invoiced: new Set(),
    ...BOSS_RANGE,
    billCosts: [cfBill("2026-09", 410000)],
  })
  const rows = (await legsRows(only))!
  assert.equal(rows.filter((r) => r[6] === BILLS_NOT_SPLIT_LEG_LABEL).length, 4)
  assert.equal(await legsRows(mixed(false)), null)
})
