/**
 * B20 ghost-row guard (decision Q16): an old-scheme id and its current alias
 * for the same line, both with money in one billing month, are found, named
 * and (only when the planner chooses) removed from the editor's working copy.
 * Shapes mirror the six live versions (read-only check, 3 Nov 2026) through
 * the real saved-billing parser.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  billingAliasGhostSaveBlockMessage,
  billingAliasGhostTotal,
  describeBillingAliasGhostLines,
  findBillingAliasGhostPairs,
  removeOldAliasGhostRows,
  summariseBillingAliasGhostPairs,
} from "@/lib/billing/billingAliasGhostPairs"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import type { BillingMonth } from "@/lib/billing/types"
import { parseMoney } from "@/lib/money"

type Row = [monthYear: string, mediaType: string, id: string, amount: string]

/** Saved blob shape (`mediaTypes[].lineItems[]`), parsed as the editor parses it. */
function saved(rows: Row[], fee = "$0.00"): BillingMonth[] {
  const months: Array<{ monthYear: string; feeTotal: string; mediaTypes: Array<{ mediaType: string; lineItems: unknown[] }> }> = []
  for (const [monthYear, mediaType, lineItemId, amount] of rows) {
    let m = months.find((x) => x.monthYear === monthYear)
    if (!m) {
      m = { monthYear, feeTotal: fee, mediaTypes: [] }
      months.push(m)
    }
    let mt = m.mediaTypes.find((x) => x.mediaType === mediaType)
    if (!mt) {
      mt = { mediaType, lineItems: [] }
      m.mediaTypes.push(mt)
    }
    mt.lineItems.push({ lineItemId, amount, header1: "Pub", header2: "Site" })
  }
  return parsePersistedBillingScheduleToMonths(months)!
}

const malay004 = () =>
  saved([
    ["June 2026", "OOH", "billing-ooh::malay004ML1", "$37,000.00"],
    ["June 2026", "OOH", "billing-ooh::malay004OH1", "$37,000.00"],
  ])

const hemaLike = () =>
  saved([
    ["May 2026", "Digital Display", "billing-digiDisplay::hema001ML4", "$3.00"],
    ["May 2026", "Digital Display", "billing-digiDisplay::hema001ML5", "$5.00"],
    ["May 2026", "Digital Display", "billing-digiDisplay::hema001DD4", "$3.00"],
    ["May 2026", "Digital Display", "billing-digiDisplay::hema001DD5", "$5.00"],
    ["May 2026", "Programmatic Display", "billing-progDisplay::hema001PD3", "$275.00"],
    ["June 2026", "Digital Display", "billing-digiDisplay::hema001ML6", "$34.00"],
    ["June 2026", "Digital Display", "billing-digiDisplay::hema001DD6", "$34.00"],
    ["June 2026", "Digital Display", "billing-digiDisplay::hema001DD7", "$3.00"],
  ], "$68.75")

test("malay004 shape: one pair, $37,000 counted twice", () => {
  const pairs = findBillingAliasGhostPairs(malay004(), "malay004")
  assert.deepEqual(pairs, [
    {
      monthYear: "June 2026",
      mediaKey: "ooh",
      lineNumber: 1,
      oldId: "billing-ooh::malay004ML1",
      currentId: "billing-ooh::malay004OH1",
      oldAmount: 37000,
      currentAmount: 37000,
    },
  ])
  assert.equal(billingAliasGhostTotal(pairs), 37000)
})

test("hema001 shape: pairs per month by line number; lone current rows are not pairs", () => {
  const pairs = findBillingAliasGhostPairs(hemaLike(), "hema001")
  assert.deepEqual(
    pairs.map((p) => [p.monthYear, p.oldId.replace("billing-digiDisplay::", ""), p.currentId.replace("billing-digiDisplay::", "")]),
    [
      ["May 2026", "hema001ML4", "hema001DD4"],
      ["May 2026", "hema001ML5", "hema001DD5"],
      ["June 2026", "hema001ML6", "hema001DD6"],
    ],
  )
  assert.equal(billingAliasGhostTotal(pairs), 42)
})

test("no false pairs: different numbers, old ids alone, $0 rows, other MBA, other channel code", () => {
  // BOSS001 v14 shape: ML1 and DD3 sit together in Digital Display; ML2 alone. Not pairs.
  const boss = saved([
    ["January 2026", "Digital Display", "billing-digiDisplay::BOSS001ML1", "$1,540.00"],
    ["January 2026", "Digital Display", "billing-digiDisplay::BOSS001ML2", "$829.00"],
    ["January 2026", "Digital Display", "billing-digiDisplay::BOSS001DD3", "$1,540.00"],
    ["January 2026", "Programmatic Video", "billing-progVideo::BOSS001ML1", "$5,979.00"],
    ["January 2026", "Programmatic Video", "billing-progVideo::BOSS001PV1", "$5,979.00"],
  ])
  assert.deepEqual(
    findBillingAliasGhostPairs(boss, "BOSS001").map((p) => [p.mediaKey, p.oldId, p.currentId]),
    [["progVideo", "billing-progVideo::BOSS001ML1", "billing-progVideo::BOSS001PV1"]],
  )
  // Old ids only (hema001 v5, PGAAUS010 v4, jayco003 v5 shapes).
  assert.deepEqual(
    findBillingAliasGhostPairs(
      saved([
        ["May 2026", "Digital Display", "billing-digiDisplay::hema001ML4", "$3.00"],
        ["May 2026", "Social Media", "billing-socialMedia::hema0011", "$3.00"],
      ]),
      "hema001",
    ),
    [],
  )
  // A $0 row doubles nothing.
  assert.deepEqual(
    findBillingAliasGhostPairs(
      saved([
        ["June 2026", "OOH", "billing-ooh::malay004ML1", "$0.00"],
        ["June 2026", "OOH", "billing-ooh::malay004OH1", "$37,000.00"],
      ]),
      "malay004",
    ),
    [],
  )
  assert.deepEqual(findBillingAliasGhostPairs(malay004(), "malay003"), [])
  assert.deepEqual(findBillingAliasGhostPairs(malay004(), ""), [])
  assert.deepEqual(findBillingAliasGhostPairs(null, "malay004"), [])
})

test("no-code social and production pairs are found too", () => {
  const months = saved([
    ["July 2025", "Social Media", "billing-socialMedia::PGAAUS0051", "$3,996.00"],
    ["July 2025", "Social Media", "billing-socialMedia::PGAAUS005SM1", "$3,996.00"],
  ])
  assert.equal(findBillingAliasGhostPairs(months, "PGAAUS005").length, 1)
  const prod: BillingMonth[] = [
    {
      monthYear: "October 2025",
      mediaTotal: "$0.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$1,000.00",
      totalAmount: "$1,000.00",
      mediaCosts: { production: "$1,000.00" } as BillingMonth["mediaCosts"],
      lineItems: {
        production: [
          { id: "PGAAUS010-production-v510-p1", header1: "", header2: "", monthlyAmounts: { "October 2025": 500 }, totalAmount: 500 },
          { id: "billing-production::PGAAUS010PROD1", header1: "", header2: "", monthlyAmounts: { "October 2025": 500 }, totalAmount: 500 },
        ],
      } as BillingMonth["lineItems"],
    },
  ]
  assert.equal(findBillingAliasGhostPairs(prod, "pgaaus010").length, 1)
  const fixed = removeOldAliasGhostRows(prod, findBillingAliasGhostPairs(prod, "PGAAUS010"))
  assert.equal(fixed[0]!.production, "$500.00")
  assert.equal(fixed[0]!.totalAmount, "$500.00")
  assert.equal(fixed[0]!.mediaTotal, "$0.00")
})

test("summary and message name each line with both amounts", () => {
  const months = hemaLike()
  const pairs = findBillingAliasGhostPairs(months, "hema001")
  const lines = summariseBillingAliasGhostPairs(pairs, months.map((m) => m.monthYear))
  assert.deepEqual(
    lines.map((l) => [l.oldId, l.currentId, l.oldTotal, l.months.length]),
    [
      ["hema001ML4", "hema001DD4", 3, 1],
      ["hema001ML5", "hema001DD5", 5, 1],
      ["hema001ML6", "hema001DD6", 34, 1],
    ],
  )
  assert.deepEqual(describeBillingAliasGhostLines(lines)[0], "hema001ML4 is a duplicate of hema001DD4 (May 2026 $3.00 and $3.00)")
  const message = billingAliasGhostSaveBlockMessage(pairs, months.map((m) => m.monthYear))!
  assert.match(message, /\$42\.00 is counted twice/)
  assert.match(message, /hema001ML6 is a duplicate of hema001DD6 \(June 2026 \$34\.00 and \$34\.00\)/)
  assert.match(message, /Keep the current rows/)
  assert.equal(billingAliasGhostSaveBlockMessage([], []), null)
})

test("message lists five lines, then a count", () => {
  const rows: Row[] = []
  for (let n = 1; n <= 7; n++) {
    rows.push(["May 2026", "OOH", `malay003ML${n}`, "$1.00"], ["May 2026", "OOH", `malay003OH${n}`, "$1.00"])
  }
  const message = billingAliasGhostSaveBlockMessage(findBillingAliasGhostPairs(saved(rows), "malay003"))!
  assert.match(message, /malay003ML5 is a duplicate/)
  assert.doesNotMatch(message, /malay003ML6 is a duplicate/)
  assert.match(message, /And 2 more line\(s\)/)
})

test("keep the current rows: old rows go, bucket, media and month totals drop by the ghost; input untouched", () => {
  const months = hemaLike()
  const before = JSON.stringify(months)
  const pairs = findBillingAliasGhostPairs(months, "hema001")
  const fixed = removeOldAliasGhostRows(months, pairs)
  assert.equal(JSON.stringify(months), before)
  const may = fixed.find((m) => m.monthYear === "May 2026")!
  assert.deepEqual(
    (may.lineItems!.digiDisplay ?? []).map((r) => r.id),
    ["billing-digiDisplay::hema001DD4", "billing-digiDisplay::hema001DD5"],
  )
  const mayBefore = months.find((m) => m.monthYear === "May 2026")!
  assert.equal(parseMoney(may.mediaCosts.digiDisplay), parseMoney(mayBefore.mediaCosts.digiDisplay)! - 8)
  assert.equal(parseMoney(may.mediaTotal), parseMoney(mayBefore.mediaTotal)! - 8)
  assert.equal(parseMoney(may.totalAmount), parseMoney(mayBefore.totalAmount)! - 8)
  assert.equal(may.feeTotal, mayBefore.feeTotal)
  assert.deepEqual(may.lineItems!.progDisplay, mayBefore.lineItems!.progDisplay)
  assert.deepEqual(findBillingAliasGhostPairs(fixed, "hema001"), [])
  // Every row with no pair is kept.
  const june = fixed.find((m) => m.monthYear === "June 2026")!
  assert.deepEqual((june.lineItems!.digiDisplay ?? []).map((r) => r.id), [
    "billing-digiDisplay::hema001DD6",
    "billing-digiDisplay::hema001DD7",
  ])
  // No pairs: same array back.
  assert.equal(removeOldAliasGhostRows(months, []), months)
})

test("month-shaped schedules (lineItems by media key with monthlyAmounts) are checked the same way", () => {
  const months: BillingMonth[] = ["May 2026", "June 2026"].map((monthYear) => ({
    monthYear,
    mediaTotal: "$20.00",
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: "$20.00",
    mediaCosts: { ooh: "$20.00" } as BillingMonth["mediaCosts"],
    lineItems: {
      ooh: [
        { id: "malay003ML1", header1: "", header2: "", monthlyAmounts: { "May 2026": 10, "June 2026": 0 }, totalAmount: 10 },
        { id: "malay003OH1", header1: "", header2: "", monthlyAmounts: { "May 2026": 10, "June 2026": 20 }, totalAmount: 30 },
      ],
    } as BillingMonth["lineItems"],
  }))
  const pairs = findBillingAliasGhostPairs(months, "malay003")
  assert.deepEqual(pairs.map((p) => p.monthYear), ["May 2026"])
})
