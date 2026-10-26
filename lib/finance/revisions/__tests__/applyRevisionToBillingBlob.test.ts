import assert from "node:assert/strict"
import test from "node:test"

import { explodeScheduleToMonthRows } from "@/scripts/migration/_scheduleTransform"

import { applyRevisionToBillingBlob, monthKeyToScheduleLabel, scheduleLabelToMonthKey } from "../applyRevisionToBillingBlob"
import { planBillingRevision } from "../planBillingRevision"
import type { RevisionOk } from "../types"
import { buxton004V10Blob, penfold022V3Blob } from "./blobFixtures"
import {
  BUXTON004_V10,
  BUXTON_CAMPAIGN,
  DEFAULT_OPTIONS,
  PENFOLD022_CAMPAIGN,
  PENFOLD022_V3,
  buxtonLocks,
  linesFromRows,
} from "./fixtures"

type Row = readonly [string, string, boolean, "m" | "f" | "a", string, number]
const COMP = { m: "media", f: "fee", a: "adserving" } as const

function rowsMap(rows: readonly Row[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const [id, , , c, month, cents] of rows) out.set(`${id}|${COMP[c]}|${month}`, cents)
  return out
}

function explodeMap(blob: unknown): Map<string, number> {
  const res = explodeScheduleToMonthRows(1, "billing", blob)
  assert.equal(res.failureReason, null)
  const out = new Map<string, number>()
  for (const r of res.rows) {
    if (r.amountCents === 0) continue
    out.set(`${r.lineItemId}|${r.component}|${r.month.slice(0, 7)}`, r.amountCents)
  }
  return out
}

function expectedAfter(rows: readonly Row[], plan: RevisionOk): Map<string, number> {
  const out = rowsMap(rows)
  for (const c of plan.afterCells) {
    for (const [comp, rec, changed] of [
      ["media", c.media, c.mediaChanged],
      ["fee", c.fee, c.feeChanged],
    ] as const) {
      if (!changed) continue
      for (const k of [...out.keys()]) if (k.startsWith(`${c.lineItemId}|${comp}|`)) out.delete(k)
      for (const [m, v] of Object.entries(rec)) if (v !== 0) out.set(`${c.lineItemId}|${comp}|${m}`, v)
    }
  }
  return out
}

function sorted(m: Map<string, number>) {
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
}

test("fixtures: the base blobs explode to the stored schedule_months rows", () => {
  assert.deepEqual(sorted(explodeMap(penfold022V3Blob())), sorted(rowsMap(PENFOLD022_V3)))
  assert.deepEqual(sorted(explodeMap(buxton004V10Blob())), sorted(rowsMap(BUXTON004_V10)))
})

test("labels round trip", () => {
  assert.equal(monthKeyToScheduleLabel("2026-10"), "October 2026")
  assert.equal(scheduleLabelToMonthKey("October 2026"), "2026-10")
  assert.equal(monthKeyToScheduleLabel("2026-13"), null)
})

test("E7 penfold022 pull Dec into Nov round trips through explode", () => {
  const plan = planBillingRevision({
    lines: linesFromRows(PENFOLD022_V3),
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
    options: DEFAULT_OPTIONS,
  })
  assert.ok(plan.ok)
  const res = applyRevisionToBillingBlob(penfold022V3Blob(), plan.afterCells)
  assert.ok(res.ok)
  assert.deepEqual(sorted(explodeMap(res.blob)), sorted(expectedAfter(PENFOLD022_V3, plan)))
  const [nov, dec] = res.blob
  assert.equal(nov!.mediaTotal, "$27,999.99")
  assert.equal(nov!.mediaCosts!.socialMedia, "$15,000.00")
  assert.equal(nov!.totalAmount, "$31,620.68")
  assert.equal(dec!.mediaTotal, "$0.00")
  assert.equal(dec!.production, "$3,379.31")
  assert.equal(dec!.totalAmount, "$3,379.31")
  const sm1 = nov!.lineItems!.socialMedia!.find((l) => l.id === "penfold022SM1")!
  assert.equal(sm1.billingMode, "manual")
  assert.equal(sm1.totalAmount, 7500)
  const dd1 = nov!.lineItems!.digiDisplay!.find((l) => l.id === "penfold022DD1")!
  assert.equal(dd1.billingMode, "auto", "unchanged lines keep their mode")
})

test("E8 prebill into Oct adds the month the blob lacks", () => {
  const plan = planBillingRevision({
    lines: linesFromRows(PENFOLD022_V3),
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request: { mode: "bill_remainder", intoMonth: "2026-10" },
    options: DEFAULT_OPTIONS,
  })
  assert.ok(plan.ok)
  const res = applyRevisionToBillingBlob(penfold022V3Blob(), plan.afterCells)
  assert.ok(res.ok)
  assert.deepEqual(res.addedMonths, ["2026-10"])
  assert.deepEqual(res.blob.map((m) => m.monthYear), ["October 2026", "November 2026", "December 2026"])
  assert.deepEqual(sorted(explodeMap(res.blob)), sorted(expectedAfter(PENFOLD022_V3, plan)))
  assert.equal(res.blob[0]!.mediaTotal, "$27,999.99")
  assert.equal(res.blob[0]!.production, "$0.00")
  assert.equal(res.blob[1]!.production, "$3,620.69", "production stays")
})

test("E1 buxton004 bill the remainder round trips", () => {
  const plan = planBillingRevision({
    lines: linesFromRows(BUXTON004_V10),
    locks: buxtonLocks(),
    currentMonth: "2026-10",
    campaignMonths: BUXTON_CAMPAIGN,
    request: { mode: "bill_remainder", intoMonth: "2026-10" },
    options: { ...DEFAULT_OPTIONS, unlockApprovedMonths: ["2026-10"] },
  })
  assert.ok(plan.ok)
  const res = applyRevisionToBillingBlob(buxton004V10Blob(), plan.afterCells)
  assert.ok(res.ok)
  assert.deepEqual(sorted(explodeMap(res.blob)), sorted(expectedAfter(BUXTON004_V10, plan)))
  const oct = res.blob.find((m) => m.monthYear === "October 2026")!
  assert.equal(oct.totalAmount, "$25,758.27")
  const mar = res.blob.find((m) => m.monthYear === "March 2026")!
  assert.equal(mar.totalAmount, "$22,630.94", "untouched months keep their header strings")
})

test("fee cells move with media and the header fee follows", () => {
  const cells = [
    {
      lineItemId: "buxton004SM1",
      media: { "2026-03": 250000, "2026-04": 500000, "2026-05": 500000, "2026-06": 500000, "2026-07": 750000 },
      fee: { "2026-03": 62500, "2026-04": 125000, "2026-05": 125000, "2026-06": 125000, "2026-07": 187500 },
      mediaChanged: true,
      feeChanged: true,
    },
  ]
  const res = applyRevisionToBillingBlob(buxton004V10Blob(), cells)
  assert.ok(res.ok)
  const map = explodeMap(res.blob)
  assert.equal(map.get("buxton004SM1|fee|2026-07"), 187500)
  assert.equal(map.get("buxton004SM1|fee|2026-08"), undefined)
  assert.equal(map.get("buxton004SM1|media|2026-08"), undefined)
  const jul = res.blob.find((m) => m.monthYear === "July 2026")!
  const aug = res.blob.find((m) => m.monthYear === "August 2026")!
  assert.equal(jul.feeTotal, "$1,875.00")
  assert.equal(aug.feeTotal, "$0.00")
  assert.equal(aug.totalAmount, "$13,288.62")
})

test("a fixed header fee (__service__fees) is never moved", () => {
  const blob = penfold022V3Blob()
  blob[0]!.feeTotal = "$500.00"
  blob[0]!.totalAmount = "$25,156.39"
  const before = explodeMap(blob)
  assert.equal(before.get("__service__fees|fee|2026-11"), 50000)
  const plan = planBillingRevision({
    lines: linesFromRows(PENFOLD022_V3),
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request: { mode: "pull_month", fromMonth: "2026-11", intoMonth: "2026-12" },
    options: DEFAULT_OPTIONS,
  })
  assert.ok(plan.ok)
  const res = applyRevisionToBillingBlob(blob, plan.afterCells)
  assert.ok(res.ok)
  const after = explodeMap(res.blob)
  assert.equal(after.get("__service__fees|fee|2026-11"), 50000)
  assert.equal(after.get("__service__fees|fee|2026-12"), undefined)
  assert.equal(res.blob[0]!.feeTotal, "$500.00")
})

test("unsupported blob shapes and unknown lines are refused", () => {
  const shape = applyRevisionToBillingBlob([{ monthYear: "2026-10", mediaTypes: [] }], [])
  assert.equal(!shape.ok && shape.code, "BLOB_SHAPE_UNSUPPORTED")
  const missing = applyRevisionToBillingBlob(penfold022V3Blob(), [
    { lineItemId: "nope", media: { "2026-11": 1 }, fee: {}, mediaChanged: true, feeChanged: false },
  ])
  assert.equal(!missing.ok && missing.code, "LINE_NOT_IN_BLOB")
})
