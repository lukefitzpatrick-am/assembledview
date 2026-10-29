/**
 * True-up writer pieces: the blob carries ad serving, the rows rebuilt from
 * the plan match what the blob explodes to (the publish round trip), the
 * undo target carries ad serving, and the other kinds keep their shape.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { explodeScheduleToMonthRows } from "@/scripts/migration/_scheduleTransform"

import { applyRevisionToBillingBlob } from "../applyRevisionToBillingBlob"
import { planTrueUpRevision } from "../planTrueUp"
import {
  buildRevisedBillingRows,
  financeEditDrafts,
  overrideMonthsFor,
  overrideSumViolations,
  restoreTargetFrom,
  rowCentsMap,
  diffCentsMaps,
  type BillingRowLike,
} from "../revisionWriteModel"
import type { RevisionLine, RevisionOk } from "../types"

const LABELS = ["September 2026", "October 2026", "November 2026"]

function blob() {
  const lineItems = {
    socialMedia: [
      {
        id: "x001SM1",
        mediaType: "socialMedia",
        billingMode: "auto",
        feeBillingMode: "auto",
        monthlyAmounts: { "September 2026": 1000, "October 2026": 1000, "November 2026": 1000 },
        feeMonthlyAmounts: { "September 2026": 250, "October 2026": 250, "November 2026": 250 },
        totalAmount: 3000,
        totalFeeAmount: 750,
      },
    ],
    digiDisplay: [
      {
        id: "x001DD1",
        mediaType: "digiDisplay",
        billingMode: "auto",
        feeBillingMode: "auto",
        monthlyAmounts: { "September 2026": 2000, "October 2026": 2000, "November 2026": 2000 },
        feeMonthlyAmounts: { "September 2026": 0, "October 2026": 0, "November 2026": 0 },
        adServingMonthlyAmounts: { "September 2026": 40, "October 2026": 40, "November 2026": 40 },
        totalAmount: 6000,
        totalFeeAmount: 0,
        totalAdServingAmount: 120,
      },
    ],
  }
  return LABELS.map((monthYear) => ({
    monthYear,
    lineItems: JSON.parse(JSON.stringify(lineItems)),
    mediaCosts: { socialMedia: "$1,000.00", digiDisplay: "$2,000.00" },
    mediaTotal: "$3,000.00",
    feeTotal: "$250.00",
    adservingTechFees: "$40.00",
    production: "$0.00",
    totalAmount: "$3,290.00",
  }))
}

function explode(b: unknown): Map<string, number> {
  const res = explodeScheduleToMonthRows(1, "billing", b)
  assert.equal(res.failureReason, null)
  return rowCentsMap(res.rows.map((r) => ({ ...r, month: String(r.month) })))
}

function baseRows(): BillingRowLike[] {
  const res = explodeScheduleToMonthRows(1, "billing", blob())
  return res.rows.map((r) => ({
    lineItemId: r.lineItemId,
    component: r.component as BillingRowLike["component"],
    month: String(r.month).slice(0, 10),
    amountCents: r.amountCents,
    source: "computed" as const,
  }))
}

function linesOf(rows: BillingRowLike[]): RevisionLine[] {
  const map = new Map<string, RevisionLine>()
  for (const r of rows) {
    const line =
      map.get(r.lineItemId) ??
      ({ lineItemId: r.lineItemId, label: r.lineItemId, channel: "x", isProduction: false, clientPaysForMedia: false, isAaLine: false, media: {}, fee: {}, adserving: {} } as RevisionLine)
    map.set(r.lineItemId, line)
    const rec = r.component === "media" ? line.media : r.component === "fee" ? line.fee : line.adserving
    rec[r.month.slice(0, 7)] = (rec[r.month.slice(0, 7)] ?? 0) + r.amountCents
  }
  return [...map.values()]
}

function plan(): { plan: RevisionOk; lines: RevisionLine[]; rows: BillingRowLike[] } {
  const rows = baseRows()
  const lines = linesOf(rows)
  const r = planTrueUpRevision({
    lines,
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: ["2026-09", "2026-10", "2026-11"],
    options: { unlockApprovedMonths: [], includeProduction: false, feeMode: "keep", adservingMode: "keep" },
    request: {
      mode: "true_up",
      asOfMonth: "2026-09",
      strategy: "spread",
      components: ["fee", "adserving", "media"],
      // Sep invoiced: fee 100.00 (not 250), ad serving 0 (not 40), media 3,500 (not 3,000).
      actuals: { "2026-09": { fee: 10000, adserving: 0, media: 350000 } },
    },
  })
  if (!r.ok) assert.fail(`${r.code}: ${r.message}`)
  return { plan: r, lines, rows }
}

test("base blob explodes to the rows the plan starts from", () => {
  assert.equal(explode(blob()).get("x001DD1|adserving|2026-09"), 4000)
})

test("the true-up blob explodes to exactly the planned rows (publish round trip)", () => {
  const { plan: p, rows } = plan()
  const applied = applyRevisionToBillingBlob(blob(), p.afterCells)
  assert.equal(applied.ok, true)
  if (!applied.ok) return
  const revised = buildRevisedBillingRows(rows, p.afterCells)
  assert.deepEqual(diffCentsMaps(explode(applied.blob), rowCentsMap(revised)), [])
  const ad = rowCentsMap(revised)
  assert.equal(ad.get("x001DD1|adserving|2026-09") ?? 0, 0)
  assert.equal((ad.get("x001DD1|adserving|2026-10") ?? 0) + (ad.get("x001DD1|adserving|2026-11") ?? 0), 12000)
  // Headers follow: September fee 100.00, ad serving 0.00.
  const sep = applied.blob.find((m) => m.monthYear === "September 2026")!
  assert.equal(sep.feeTotal, "$100.00")
  assert.equal(sep.adservingTechFees, "$0.00")
})

test("sum law holds for every component, ad serving included", () => {
  const { plan: p, lines } = plan()
  const checks = p.afterCells.flatMap((c) => {
    const base = lines.find((l) => l.lineItemId === c.lineItemId)!
    const out: Parameters<typeof overrideSumViolations>[0] = []
    if (c.mediaChanged) out.push({ lineItemId: c.lineItemId, component: "media" as const, months: overrideMonthsFor(base.media, c.media), expectedCents: Object.values(base.media).reduce((s, v) => s + v, 0) })
    if (c.feeChanged) out.push({ lineItemId: c.lineItemId, component: "fee" as const, months: overrideMonthsFor(base.fee, c.fee), expectedCents: Object.values(base.fee).reduce((s, v) => s + v, 0) })
    if (c.adservingChanged) out.push({ lineItemId: c.lineItemId, component: "adserving" as const, months: overrideMonthsFor(base.adserving, c.adserving ?? {}), expectedCents: Object.values(base.adserving).reduce((s, v) => s + v, 0) })
    return out
  })
  assert.ok(checks.some((c) => c.component === "adserving"))
  assert.deepEqual(overrideSumViolations(checks), [])
})

test("undo target and finance edits carry ad serving for a true-up", () => {
  const { plan: p, lines } = plan()
  const target = restoreTargetFrom(lines, p)
  assert.equal(target.adserving?.["x001DD1"]?.["2026-09"], 4000)
  assert.ok(financeEditDrafts(p).some((e) => e.component === "adserving" && e.month === "2026-09" && e.newCents === 0))
})

test("the other kinds: no ad serving in the undo target, blob ad serving untouched", () => {
  const rows = baseRows()
  const lines = linesOf(rows)
  const fake: RevisionOk = {
    ok: true,
    lines: [],
    months: [],
    movedCents: 0,
    credits: [],
    warnings: [],
    cannotUndo: [],
    afterCells: [{ lineItemId: "x001SM1", media: { "2026-10": 200000, "2026-11": 100000 }, fee: lines[0]!.fee, mediaChanged: true, feeChanged: false }],
    hash: "x",
  }
  const t = restoreTargetFrom(lines, fake)
  assert.equal("adserving" in t, false)
  const applied = applyRevisionToBillingBlob(blob(), fake.afterCells)
  assert.equal(applied.ok, true)
  if (!applied.ok) return
  for (const m of applied.blob) assert.equal(m.adservingTechFees, "$40.00")
})
