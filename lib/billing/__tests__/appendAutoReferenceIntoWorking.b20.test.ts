/**
 * MB-30 fix (B20): old line ids (`ML`, no code, production `-vNNN-pN`) in
 * saved working billing match the editor's rewritten ids by alias, so the
 * append merge doesn't push a second row for the same line.
 *
 * Reproduced case (discovery 3 Nov 2026): working OOH `[ML1 $5,000 manual,
 * ML2 $3,000]` plus template `[OH1, OH2]` gave 4 rows and $15,000 media. It
 * must give 2 rows and $8,000.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  appendAutoLineItemTemplateIntoWorking,
  appendMissingLineItemsOnly,
  type BillingAliasReconcileEntry,
} from "@/lib/billing/appendAutoReferenceIntoWorking"
import { buildBillingAliasNumberCheck } from "@/lib/billing/billingAliasNumberCheck"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

const MAY = "May 2026"
const JUN = "June 2026"
const FMT = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function line(id: string, amounts: Record<string, number>, extra?: Partial<BillingLineItem>): BillingLineItem {
  return {
    id,
    header1: "Pub",
    header2: "Site",
    monthlyAmounts: { ...amounts },
    totalAmount: Object.values(amounts).reduce((s, v) => s + v, 0),
    ...extra,
  }
}

function month(monthYear: string, lineItems: Record<string, BillingLineItem[]>): BillingMonth {
  const mediaCosts: Record<string, string> = {}
  let media = 0
  for (const [mk, items] of Object.entries(lineItems)) {
    const sum = items.reduce((s, li) => s + (li.monthlyAmounts[monthYear] || 0), 0)
    mediaCosts[mk] = FMT.format(sum)
    if (mk !== "production") media += sum
  }
  return {
    monthYear,
    mediaTotal: FMT.format(media),
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: FMT.format(media),
    mediaCosts: mediaCosts as BillingMonth["mediaCosts"],
    lineItems: lineItems as BillingMonth["lineItems"],
  }
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

function money(s: unknown): number {
  return Number(String(s ?? "0").replace(/[$,]/g, "")) || 0
}

function mediaSum(months: BillingMonth[]): number {
  return Math.round(months.reduce((s, m) => s + money(m.mediaTotal), 0) * 100) / 100
}

function rows(months: BillingMonth[], mk: string, i = 0): BillingLineItem[] {
  return ((months[i]?.lineItems as Record<string, BillingLineItem[]> | undefined)?.[mk] ?? []) as BillingLineItem[]
}

function reproduced() {
  const ml1 = line("billing-ooh::malay003ML1", { [MAY]: 5000 }, { billingMode: "manual" })
  const ml2 = line("billing-ooh::malay003ML2", { [MAY]: 3000 })
  const oh1 = line("billing-ooh::malay003OH1", { [MAY]: 4000 })
  const oh2 = line("billing-ooh::malay003OH2", { [MAY]: 3000 })
  return {
    working: [month(MAY, { ooh: [ml1, ml2] })],
    template: [month(MAY, { ooh: [oh1, oh2] })],
  }
}

test("reproduced (no MBA number, today's matching): 4 rows and $15,000", () => {
  const { working, template } = reproduced()
  const merged = appendAutoLineItemTemplateIntoWorking(working, template, FMT)
  assert.equal(rows(merged, "ooh").length, 4)
  assert.equal(mediaSum(merged), 15000)
})

test("reproduced, fixed: two old OOH rows plus two new ones give 2 rows and $8,000", () => {
  const { working, template } = reproduced()
  const entries: BillingAliasReconcileEntry[] = []
  const merged = appendAutoLineItemTemplateIntoWorking(working, template, FMT, {
    mbaNumber: "malay003",
    onReconcile: (e) => entries.push(...e),
  })
  const ooh = rows(merged, "ooh")
  assert.equal(ooh.length, 2)
  assert.equal(mediaSum(merged), 8000)
  assert.deepEqual(
    ooh.map((r) => [r.id, r.monthlyAmounts[MAY], r.billingMode]),
    [
      ["billing-ooh::malay003OH1", 5000, "manual"],
      ["billing-ooh::malay003OH2", 3000, undefined],
    ],
  )
  assert.equal(money(merged[0]!.mediaCosts.ooh), 8000)
  assert.deepEqual(
    entries.map((e) => e.kind === "alias_adoption" && [e.mediaKey, e.monthYear, e.fromId, e.toId]),
    [
      ["ooh", MAY, "billing-ooh::malay003ML1", "billing-ooh::malay003OH1"],
      ["ooh", MAY, "billing-ooh::malay003ML2", "billing-ooh::malay003OH2"],
    ],
  )
  // Working input is not mutated.
  assert.equal(rows(working, "ooh")[0]!.id, "billing-ooh::malay003ML1")
})

test("follow-auto resync: the manual row keeps its money and mode; the auto row takes the template", () => {
  const { working, template } = reproduced()
  const merged = appendAutoLineItemTemplateIntoWorking(working, template, FMT, {
    mbaNumber: "malay003",
    isManualBilling: true,
    resyncExistingFromTemplate: true,
  })
  const ooh = rows(merged, "ooh")
  assert.deepEqual(
    ooh.map((r) => [r.id, r.monthlyAmounts[MAY], r.billingMode]),
    [
      ["billing-ooh::malay003OH1", 5000, "manual"],
      ["billing-ooh::malay003OH2", 3000, undefined],
    ],
  )
  assert.equal(mediaSum(merged), 8000)
})

test("Prebill and fee months stay on the adopted row", () => {
  const ml1 = line("malay004ML1", { [MAY]: 37000, [JUN]: 0 }, {
    billingMode: "manual",
    preBill: true,
    feeMonthlyAmounts: { [MAY]: 100, [JUN]: 0 },
    totalFeeAmount: 100,
  })
  const working = [month(MAY, { ooh: [ml1] }), month(JUN, { ooh: [clone(ml1)] })]
  const oh1 = line("billing-ooh::malay004OH1", { [MAY]: 15857.14, [JUN]: 21142.86 })
  const oh2 = line("billing-ooh::malay004OH2", { [MAY]: 0, [JUN]: 10 })
  const template = [month(MAY, { ooh: [oh1, oh2] }), month(JUN, { ooh: [oh1, oh2] })]
  const merged = appendAutoLineItemTemplateIntoWorking(working, template, FMT, { mbaNumber: "malay004" })
  for (const i of [0, 1]) {
    const ooh = rows(merged, "ooh", i)
    assert.deepEqual(ooh.map((r) => r.id), ["billing-ooh::malay004OH1", "billing-ooh::malay004OH2"])
    assert.equal(ooh[0]!.preBill, true)
    assert.deepEqual(ooh[0]!.feeMonthlyAmounts, { [MAY]: 100, [JUN]: 0 })
    assert.equal(ooh[0]!.monthlyAmounts[MAY], 37000)
  }
})

test("one to one by line number, not order: different amounts map to their own line", () => {
  const existing = [
    line("PGAAUS010ML1", { [MAY]: 100 }, { billingMode: "manual" }),
    line("PGAAUS010ML2", { [MAY]: 200 }, { billingMode: "manual" }),
  ]
  const template = [
    line("billing-digiDisplay::PGAAUS010DD2", { [MAY]: 2 }),
    line("billing-digiDisplay::PGAAUS010DD1", { [MAY]: 1 }),
  ]
  const r = appendMissingLineItemsOnly(existing, template, [MAY], { mbaNumber: "PGAAUS010", mediaKey: "digiDisplay" })
  assert.deepEqual(
    r.list.map((x) => [x.id, x.monthlyAmounts[MAY]]),
    [
      ["billing-digiDisplay::PGAAUS010DD1", 100],
      ["billing-digiDisplay::PGAAUS010DD2", 200],
    ],
  )
  assert.equal(r.aliasAdoptions.length, 2)
  assert.equal(r.didAppend, true)
})

test("no-code social and production -vNNN-pN adopt PROD<n> when the loaded lines prove the number (B35, MB-40)", () => {
  // Lines re-saved with current ids; billing kept the old ones (live: curatif002, BICAU001).
  const socialCheck = buildBillingAliasNumberCheck(
    { socialMedia: [{ line_item_id: "PGAAUS005SM1", line_item: 1 }, { line_item_id: "PGAAUS005SM2", line_item: 2 }] },
    "PGAAUS005",
  )
  const social = appendMissingLineItemsOnly(
    [line("PGAAUS0051", { [MAY]: 15984 }), line("PGAAUS0052", { [MAY]: 1 })],
    [line("billing-socialMedia::PGAAUS005SM1", { [MAY]: 9 }), line("billing-socialMedia::PGAAUS005SM2", { [MAY]: 9 })],
    [MAY],
    { mbaNumber: "PGAAUS005", mediaKey: "socialMedia", aliasNumberCheck: socialCheck },
  )
  assert.deepEqual(social.list.map((x) => [x.id, x.monthlyAmounts[MAY]]), [
    ["billing-socialMedia::PGAAUS005SM1", 15984],
    ["billing-socialMedia::PGAAUS005SM2", 1],
  ])
  // The loaded production lines carry the old ids at the matching positions.
  const prodCheck = buildBillingAliasNumberCheck(
    {
      production: [
        { line_item_id: "PGAAUS010-production-v510-p1", line_item: 1 },
        { line_item_id: "PGAAUS010-production-v510-p2", line_item: 2 },
      ],
    },
    "PGAAUS010",
  )
  const prod = appendMissingLineItemsOnly(
    [line("PGAAUS010-production-v510-p1", { [MAY]: 500 }), line("PGAAUS010-production-v510-p2", { [MAY]: 50 })],
    [line("billing-production::PGAAUS010PROD1", { [MAY]: 1 }), line("billing-production::PGAAUS010PROD2", { [MAY]: 1 })],
    [MAY],
    { mbaNumber: "PGAAUS010", mediaKey: "production", aliasNumberCheck: prodCheck },
  )
  assert.deepEqual(prod.list.map((x) => [x.id, x.monthlyAmounts[MAY]]), [
    ["billing-production::PGAAUS010PROD1", 500],
    ["billing-production::PGAAUS010PROD2", 50],
  ])
})

test("B35 (MB-40): without proof a no-code or production id never pairs by number", () => {
  const social = appendMissingLineItemsOnly(
    [line("PGAAUS0051", { [MAY]: 15984 }), line("PGAAUS0052", { [MAY]: 1 })],
    [line("billing-socialMedia::PGAAUS005SM1", { [MAY]: 9 }), line("billing-socialMedia::PGAAUS005SM2", { [MAY]: 9 })],
    [MAY],
    { mbaNumber: "PGAAUS005", mediaKey: "socialMedia" },
  )
  assert.equal(social.aliasAdoptions.length, 0)
  assert.deepEqual(
    social.list.map((x) => x.id),
    ["PGAAUS0051", "PGAAUS0052", "billing-socialMedia::PGAAUS005SM1", "billing-socialMedia::PGAAUS005SM2"],
  )
  // The editor renumbered no-code lines: saved PGAAUS0051 sits at position 2 (shows
  // as SM2) and PGAAUS0052 at position 1 (shows as SM1). By number alone each billing
  // row would take the other line's id. With the loaded lines, neither pairs.
  const renumbered = buildBillingAliasNumberCheck(
    { socialMedia: [{ line_item_id: "PGAAUS0052", line_item: 1 }, { line_item_id: "PGAAUS0051", line_item: 2 }] },
    "PGAAUS005",
  )
  const wrong = appendMissingLineItemsOnly(
    [line("PGAAUS0051", { [MAY]: 700 }), line("PGAAUS0052", { [MAY]: 300 })],
    [line("PGAAUS005SM1", { [MAY]: 300 }), line("PGAAUS005SM2", { [MAY]: 700 })],
    [MAY],
    { mbaNumber: "PGAAUS005", mediaKey: "socialMedia", aliasNumberCheck: renumbered },
  )
  assert.equal(wrong.aliasAdoptions.length, 0)
  assert.deepEqual(
    wrong.list.filter((x) => x.id === "PGAAUS0051" || x.id === "PGAAUS0052").map((x) => x.monthlyAmounts[MAY]),
    [700, 300],
    "each old row keeps its own id and amount",
  )
  // ML ids still pair by number with no check (the editor keeps their number).
  const ml = appendMissingLineItemsOnly(
    [line("malay004ML1", { [MAY]: 37000 }), line("malay004ML2", { [MAY]: 1 })],
    [line("malay004OH1", { [MAY]: 37000 }), line("malay004OH2", { [MAY]: 1 })],
    [MAY],
    { mbaNumber: "malay004", mediaKey: "ooh" },
  )
  assert.equal(ml.aliasAdoptions.length, 2)
})

test("MBA case difference (hema001 vs HEMA001) still matches", () => {
  const r = appendMissingLineItemsOnly(
    [line("hema001ML4", { [MAY]: 3 }), line("hema001ML5", { [MAY]: 5 })],
    [line("billing-digiDisplay::HEMA001DD4", { [MAY]: 3 }), line("billing-digiDisplay::HEMA001DD5", { [MAY]: 5 })],
    [MAY],
    { mbaNumber: "HEMA001", mediaKey: "digiDisplay" },
  )
  assert.equal(r.list.length, 2)
  assert.equal(r.aliasAdoptions.length, 2)
})

test("a real new line (new number, no old row) still appends", () => {
  const r = appendMissingLineItemsOnly(
    [line("malay003ML1", { [MAY]: 10 }), line("malay003ML2", { [MAY]: 20 })],
    [
      line("billing-ooh::malay003OH1", { [MAY]: 1 }),
      line("billing-ooh::malay003OH2", { [MAY]: 2 }),
      line("billing-ooh::malay003OH3", { [MAY]: 30 }),
    ],
    [MAY],
    { mbaNumber: "malay003", mediaKey: "ooh" },
  )
  assert.deepEqual(r.list.map((x) => [x.id, x.monthlyAmounts[MAY]]), [
    ["billing-ooh::malay003OH1", 10],
    ["billing-ooh::malay003OH2", 20],
    ["billing-ooh::malay003OH3", 30],
  ])
})

test("a row a template id already matches is never alias-claimed (saved doubled rows stay for the warning)", () => {
  const r = appendMissingLineItemsOnly(
    [line("hema001ML4", { [MAY]: 3 }), line("hema001DD4", { [MAY]: 3 })],
    [line("billing-digiDisplay::hema001DD4", { [MAY]: 3 })],
    [MAY],
    { mbaNumber: "hema001", mediaKey: "digiDisplay" },
  )
  assert.deepEqual(r.list.map((x) => x.id), ["hema001ML4", "hema001DD4"])
  assert.equal(r.aliasAdoptions.length, 0)
  assert.equal(r.didAppend, false)
})

test("placeholder new-N: skipped and reported when the bucket has rows, appended when empty", () => {
  const skipped = appendMissingLineItemsOnly(
    [line("krusty001PB1", { [MAY]: 20000 }, { billingMode: "manual" }), line("krusty001PB2", { [MAY]: 1 })],
    [line("billing-progBvod::new-2", { [MAY]: 99 })],
    [MAY],
    { mbaNumber: "krusty001", mediaKey: "progBvod" },
  )
  assert.equal(skipped.list.length, 2)
  assert.deepEqual(skipped.placeholderSkips, [{ id: "billing-progBvod::new-2" }])
  assert.equal(skipped.didAppend, false)

  // Single-line bucket: the placeholder doesn't rename the real row either.
  const single = appendMissingLineItemsOnly(
    [line("krusty001PB1", { [MAY]: 20000 }, { billingMode: "manual" })],
    [line("billing-progBvod::new-0", { [MAY]: 99 })],
    [MAY],
  )
  assert.deepEqual(single.list.map((x) => x.id), ["krusty001PB1"])
  assert.equal(single.placeholderSkips.length, 1)

  const empty = appendAutoLineItemTemplateIntoWorking(
    [month(MAY, { search: [line("krusty001SE1", { [MAY]: 5 })] })],
    [month(MAY, { search: [line("krusty001SE1", { [MAY]: 5 })], progBvod: [line("billing-progBvod::new-0", { [MAY]: 99 })] })],
    FMT,
  )
  assert.deepEqual(rows(empty, "progBvod").map((x) => x.id), ["billing-progBvod::new-0"])
})

test("single-line drift (non-alias ids) still adopts as before", () => {
  const r = appendMissingLineItemsOnly(
    [line("legacy-composite-id", { [MAY]: 7 }, { billingMode: "manual" })],
    [line("billing-search::krusty001SE1", { [MAY]: 1 })],
    [MAY],
    { mbaNumber: "krusty001", mediaKey: "search" },
  )
  assert.deepEqual(r.list.map((x) => [x.id, x.monthlyAmounts[MAY]]), [["billing-search::krusty001SE1", 7]])
  assert.equal(r.aliasAdoptions.length, 0)
})

test("same-canonical duplicates still collapse and report (backstop)", () => {
  const collapses: string[] = []
  const merged = appendAutoLineItemTemplateIntoWorking(
    [month(MAY, { ooh: [line("malay003OH1", { [MAY]: 5 }), line("billing-ooh::malay003OH1", { [MAY]: 5 })] })],
    [month(MAY, { ooh: [line("billing-ooh::malay003OH1", { [MAY]: 5 })] })],
    FMT,
    { mbaNumber: "malay003", onCanonicalDedupe: (b) => collapses.push(...b.map((c) => c.canonicalId)) },
  )
  assert.equal(rows(merged, "ooh").length, 1)
  assert.deepEqual(collapses, ["malay003OH1"])
})

test("add channel, remove it, add it again with old ids: no extra rows, total unchanged", () => {
  let working = reproduced().working
  const oohTemplate = reproduced().template[0]!.lineItems!.ooh as BillingLineItem[]
  const search = line("billing-search::malay003SE1", { [MAY]: 1000 })
  const withSearch = [month(MAY, { ooh: clone(oohTemplate), search: [search] })]
  const oohOnly = [month(MAY, { ooh: clone(oohTemplate) })]
  for (const t of [withSearch, oohOnly, withSearch]) {
    working = appendAutoLineItemTemplateIntoWorking(working, clone(t), FMT, { mbaNumber: "malay003" })
  }
  assert.deepEqual(rows(working, "ooh").map((r) => r.id), ["billing-ooh::malay003OH1", "billing-ooh::malay003OH2"])
  assert.equal(rows(working, "search").length, 1)
  assert.equal(mediaSum(working), 9000)
})

test("one to one: a working row a template id matches is never renamed by another template row's alias", () => {
  // Template carries an old-id row and the current one (skeleton from working); working has the current one.
  const r = appendMissingLineItemsOnly(
    [line("billing-ooh::malay003OH1", { [MAY]: 5 }, { billingMode: "manual" })],
    [line("billing-ooh::malay003ML1", { [MAY]: 5 }), line("billing-ooh::malay003OH1", { [MAY]: 5 })],
    [MAY],
    { mbaNumber: "malay003", mediaKey: "ooh" },
  )
  assert.equal(r.aliasAdoptions.length, 0)
  assert.equal(r.list[0]!.id, "billing-ooh::malay003OH1")
  assert.equal(r.list[0]!.billingMode, "manual")
})

test("placeholder into an empty list is appended (direct call)", () => {
  const r = appendMissingLineItemsOnly([], [line("billing-progBvod::new-0", { [MAY]: 9 })], [MAY], {
    mbaNumber: "krusty001",
    mediaKey: "progBvod",
  })
  assert.deepEqual(r.list.map((x) => x.id), ["billing-progBvod::new-0"])
  assert.equal(r.placeholderSkips.length, 0)
})
