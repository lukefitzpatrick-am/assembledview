/**
 * FIN-9 (MB-4 / MB-11): billing line ids are bare in line_items but either
 * bare or `billing-{media}::bare` in schedule_months and the billing blob
 * (13,721 decorated billing-basis rows on 28 Oct 2026). Every join in the
 * revisions engine must treat the two shapes as one line.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { applyRevisionToBillingBlob } from "../applyRevisionToBillingBlob"
import { assembleRevisionLines } from "../assembleRevisionLines"
import { buildPreviewGrid } from "../panelModel"
import { planBillingRevision } from "../planBillingRevision"
import {
  buildRevisedBillingRows,
  diffCentsMaps,
  reviseApprovedSlice,
  rowCentsMap,
  type BillingRowLike,
} from "../revisionWriteModel"
import type { RevisionOk } from "../types"
import { DEFAULT_OPTIONS, PENFOLD022_CAMPAIGN, PENFOLD022_V3, linesFromRows } from "./fixtures"

const deco = (id: string, media = "socialMedia") => `billing-${media}::${id}`

const DECORATED_ROWS: BillingRowLike[] = PENFOLD022_V3.map(([id, , , c, m, cents]) => ({
  lineItemId: deco(id),
  component: c === "m" ? "media" : c === "f" ? "fee" : "adserving",
  month: `${m}-01`,
  amountCents: cents,
  source: "computed",
}))

function e7(lineFilter?: string[]): RevisionOk {
  const r = planBillingRevision({
    lines: linesFromRows(PENFOLD022_V3),
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
    options: { ...DEFAULT_OPTIONS, ...(lineFilter ? { lineFilter } : {}) },
  })
  if (!r.ok) assert.fail(`expected ok, got ${r.code}: ${r.message}`)
  return r
}

test("assembleRevisionLines joins decorated schedule rows and AA ids to bare line_items", () => {
  const { lines, unmatchedLineIds } = assembleRevisionLines({
    lineRows: [
      { lineItemId: "abc1", channel: "search", publisher: "Google", platform: null, clientPaysForMedia: false, position: 0 },
      { lineItemId: "abc2", channel: "search", publisher: "Google", platform: null, clientPaysForMedia: false, position: 1 },
    ],
    billingRows: [
      { lineItemId: "billing-search::abc1", component: "media", month: "2026-10-01", amountCents: 100_00 },
      { lineItemId: "billing-search::abc1", component: "fee", month: "2026-10-01", amountCents: 10_00 },
      { lineItemId: "abc2", component: "media", month: "2026-11-01", amountCents: 50_00 },
      { lineItemId: "__service__fees", component: "fee", month: "2026-10-01", amountCents: 5_00 },
      { lineItemId: "billing-search::gone9", component: "media", month: "2026-10-01", amountCents: 1 },
    ],
    aaLineIds: new Set(["billing-search::abc2"]),
  })
  assert.deepEqual(unmatchedLineIds, ["billing-search::gone9"])
  assert.equal(lines.length, 2)
  assert.deepEqual(lines[0]!.media, { "2026-10": 100_00 })
  assert.deepEqual(lines[0]!.fee, { "2026-10": 10_00 })
  assert.equal(lines[0]!.lineItemId, "abc1")
  assert.equal(lines[0]!.isAaLine, false)
  assert.equal(lines[1]!.isAaLine, true)
})

test("planner lineFilter accepts a decorated id for a bare line", () => {
  const plain = e7(["penfold022SM1"])
  const decorated = e7([deco("penfold022SM1")])
  assert.deepEqual(decorated.afterCells, plain.afterCells)
  const sm1 = decorated.lines.find((l) => l.lineItemId === "penfold022SM1")!
  assert.equal(sm1.skipped, undefined)
})

test("revised rows replace decorated base rows once and keep their id shape", () => {
  const plan = e7()
  const rows = buildRevisedBillingRows(DECORATED_ROWS, plan.afterCells)
  const total = (rs: BillingRowLike[]) => rs.reduce((s, r) => s + r.amountCents, 0)
  // No double count: the changed lines' old decorated rows are gone.
  assert.equal(total(rows), total(DECORATED_ROWS))
  assert.ok(rows.every((r) => r.lineItemId.startsWith("billing-socialMedia::")))
  const sm1 = rows.filter((r) => r.lineItemId === deco("penfold022SM1"))
  assert.deepEqual(sm1, [
    { lineItemId: deco("penfold022SM1"), component: "media", month: "2026-11-01", amountCents: 750_000, source: "override" },
  ])
})

test("rowCentsMap keys bare and decorated rows as one line", () => {
  const bare = DECORATED_ROWS.map((r) => ({ ...r, lineItemId: r.lineItemId.replace(/^billing-[^:]+::/, "") }))
  assert.deepEqual(diffCentsMaps(rowCentsMap(bare), rowCentsMap(DECORATED_ROWS)), [])
})

test("approved slice with decorated ids still gains the changed line's new months", () => {
  const slice = {
    totalCents: 750_000,
    lines: [{ lineItemId: deco("penfold022SM1"), months: ["2026-11", "2026-12"], mediaCents: 750_000, feeCents: 0, adservingCents: 0, productionCents: 0 }],
  }
  const rows: BillingRowLike[] = [
    { lineItemId: "penfold022SM1", component: "media", month: "2026-10-01", amountCents: 750_000, source: "override" },
  ]
  const out = reviseApprovedSlice(slice, rows, new Set(["penfold022SM1"]))!
  assert.deepEqual(out.lines[0]!.months, ["2026-10", "2026-11", "2026-12"])
})

test("preview grid reads base cells for a decorated base line", () => {
  const plan = e7()
  const base = linesFromRows(PENFOLD022_V3).map((l) => ({ lineItemId: deco(l.lineItemId), media: l.media }))
  const grid = buildPreviewGrid(plan, base)
  const plainGrid = buildPreviewGrid(plan, linesFromRows(PENFOLD022_V3))
  assert.deepEqual(grid.rows, plainGrid.rows)
})

test("blob rebuild finds a line whose blob id is decorated", () => {
  const blob = [
    {
      monthYear: "November 2026",
      feeTotal: "$0.00",
      mediaTotal: "$100.00",
      totalAmount: "$100.00",
      production: "$0.00",
      adservingTechFees: "$0.00",
      mediaCosts: { search: "$100.00" },
      lineItems: {
        search: [{ id: "billing-search::abc1", monthlyAmounts: { "November 2026": 100, "December 2026": 0 }, totalAmount: 100 }],
      },
    },
    {
      monthYear: "December 2026",
      feeTotal: "$0.00",
      mediaTotal: "$0.00",
      totalAmount: "$0.00",
      production: "$0.00",
      adservingTechFees: "$0.00",
      mediaCosts: { search: "$0.00" },
      lineItems: {
        search: [{ id: "billing-search::abc1", monthlyAmounts: { "November 2026": 100, "December 2026": 0 }, totalAmount: 100 }],
      },
    },
  ]
  const res = applyRevisionToBillingBlob(blob, [
    { lineItemId: "abc1", media: { "2026-12": 100_00 }, fee: {}, mediaChanged: true, feeChanged: false },
  ])
  if (!res.ok) assert.fail(`${res.code}: ${res.message}`)
  const line = res.blob[1]!.lineItems!.search![0]!
  assert.deepEqual(line.monthlyAmounts, { "November 2026": 0, "December 2026": 100 })
  assert.equal(res.blob[1]!.mediaTotal, "$100.00")
})
