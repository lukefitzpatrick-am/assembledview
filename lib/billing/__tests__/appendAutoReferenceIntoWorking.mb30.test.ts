/**
 * MB-30 — adding a channel must not duplicate an overridden line in working months.
 *
 * Live shape (supabase001 v1): progBvod $20k prepaid (Aug $20k / Sep $0) + new Search $10k.
 * Working months reported Aug $30,163.93 = prepaid + AUTO — i.e. progBvod present twice.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  appendAutoLineItemTemplateIntoWorking,
  appendMissingLineItemsOnly,
  collectWorkingLineIdsByMediaKey,
} from "@/lib/billing/appendAutoReferenceIntoWorking"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import {
  billingOverrideLineIdsMatch,
  toBillingOverrideLineItemId,
} from "@/lib/finance/manualBillingOverridesUi"

const AUG = "August 2025"
const SEP = "September 2025"
const FMT = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function line(
  id: string,
  amounts: Record<string, number>,
  extra?: Partial<BillingLineItem>
): BillingLineItem {
  const totalAmount = Object.values(amounts).reduce((s, v) => s + v, 0)
  return {
    id,
    header1: extra?.header1 ?? "Platform",
    header2: extra?.header2 ?? "Targeting",
    monthlyAmounts: { ...amounts },
    totalAmount,
    ...extra,
  }
}

function month(
  monthYear: string,
  lineItems: NonNullable<BillingMonth["lineItems"]>,
  mediaTotal: string
): BillingMonth {
  const mediaCosts: BillingMonth["mediaCosts"] = {
    search: "$0.00",
    socialMedia: "$0.00",
    television: "$0.00",
    radio: "$0.00",
    newspaper: "$0.00",
    magazines: "$0.00",
    ooh: "$0.00",
    cinema: "$0.00",
    digiDisplay: "$0.00",
    digiAudio: "$0.00",
    digiVideo: "$0.00",
    bvod: "$0.00",
    integration: "$0.00",
    progDisplay: "$0.00",
    progVideo: "$0.00",
    progBvod: "$0.00",
    progAudio: "$0.00",
    progOoh: "$0.00",
    influencers: "$0.00",
    production: "$0.00",
  }
  for (const [mk, items] of Object.entries(lineItems)) {
    const sum = (items ?? []).reduce((s, li) => s + (li.monthlyAmounts[monthYear] || 0), 0)
    ;(mediaCosts as Record<string, string>)[mk] = FMT.format(sum)
  }
  return {
    monthYear,
    mediaTotal,
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: mediaTotal,
    mediaCosts,
    lineItems,
  }
}

function countCanonicalIds(items: BillingLineItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const li of items) {
    const c = toBillingOverrideLineItemId(String(li.id ?? ""))
    if (!c) continue
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return counts
}

function mediaSum(months: BillingMonth[]): number {
  return months.reduce((s, m) => {
    const n = parseFloat(String(m.mediaTotal ?? "$0").replace(/[^0-9.-]/g, "")) || 0
    return s + n
  }, 0)
}

test("MB-30: bare working id vs decorated template — add Search must not duplicate progBvod", () => {
  // Applied override on working (hydrate/Apply often stores bare line_item_id).
  const prepaid = line(
    "supabase001PB1",
    { [AUG]: 20000, [SEP]: 0 },
    { billingMode: "manual", header1: "YouTube", header2: "BVOD" }
  )
  const working: BillingMonth[] = [
    month(AUG, { progBvod: [prepaid] }, "$20,000.00"),
    month(SEP, { progBvod: [{ ...prepaid, monthlyAmounts: { ...prepaid.monthlyAmounts } }] }, "$0.00"),
  ]

  // Auto template after Search channel is enabled (attach uses billing-{media}::).
  const autoProg = line(
    "billing-progBvod::supabase001PB1",
    { [AUG]: 10163.93, [SEP]: 9836.07 },
    { header1: "YouTube", header2: "BVOD" }
  )
  const searchNew = line(
    "billing-search::supabase001SE1",
    { [AUG]: 5081.97, [SEP]: 4918.03 },
    { header1: "Google", header2: "Brand" }
  )
  const template: BillingMonth[] = [
    month(AUG, { progBvod: [autoProg], search: [searchNew] }, "$15,245.90"),
    month(SEP, { progBvod: [autoProg], search: [searchNew] }, "$14,754.10"),
  ]

  assert.equal(
    billingOverrideLineIdsMatch(prepaid.id, autoProg.id),
    true,
    "precondition: bare ↔ decorated must match"
  )

  // Post-Save append path: followAuto=false → opts undefined (isManualBilling not passed).
  const merged = appendAutoLineItemTemplateIntoWorking(working, template, FMT)

  const ids = collectWorkingLineIdsByMediaKey(merged)
  const progIds = ids.get("progBvod") ?? []
  const counts = countCanonicalIds(
    (merged[0]?.lineItems?.progBvod as BillingLineItem[] | undefined) ?? []
  )

  assert.equal(progIds.length, 1, `progBvod ids=${JSON.stringify(progIds)}`)
  assert.equal(counts.get("supabase001PB1"), 1, "canonical progBvod must appear once")
  assert.ok((ids.get("search") ?? []).length === 1, "Search must be appended once")

  const augProg = (merged[0]!.lineItems!.progBvod as BillingLineItem[])[0]!
  assert.equal(augProg.monthlyAmounts[AUG], 20000, "prepaid Aug amount must be preserved")
  assert.equal(augProg.billingMode, "manual")

  const total = mediaSum(merged)
  assert.ok(
    Math.abs(total - 30000) < 0.02,
    `working media total must stay $30k campaign, got ${total}`
  )
})

test("MB-30: appendMissingLineItemsOnly does not push when bare↔decorated", () => {
  const existing = [
    line("supabase001PB1", { [AUG]: 20000, [SEP]: 0 }, { billingMode: "manual" }),
  ]
  const template = [
    line("billing-progBvod::supabase001PB1", { [AUG]: 10163.93, [SEP]: 9836.07 }),
  ]
  const { list, didAppend } = appendMissingLineItemsOnly(existing, template, [AUG, SEP], {
    isManualBilling: true,
  })
  assert.equal(list.length, 1)
  assert.equal(didAppend, false)
  assert.equal(list[0]!.monthlyAmounts[AUG], 20000)
})

test("MB-30 loud guard: same-canonical bare+decorated duplicates collapse (telemetry path)", () => {
  const prepaid = line(
    "supabase001PB1",
    { [AUG]: 20000, [SEP]: 0 },
    { billingMode: "manual", header1: "YouTube", header2: "BVOD" }
  )
  // Same canonical as prepaid, different raw id — would double without dedupe.
  const twin = line(
    "billing-progBvod::supabase001PB1",
    { [AUG]: 10163.93, [SEP]: 9836.07 },
    { header1: "YouTube", header2: "BVOD" }
  )
  const working: BillingMonth[] = [
    month(AUG, { progBvod: [prepaid, twin] }, "$30,163.93"),
    month(SEP, { progBvod: [JSON.parse(JSON.stringify(prepaid))] }, "$0.00"),
  ]
  const search = line("billing-search::supabase001SE1", {
    [AUG]: 5081.97,
    [SEP]: 4918.03,
  })
  const template: BillingMonth[] = [
    month(AUG, { progBvod: [twin], search: [search] }, "$15,245.90"),
    month(SEP, { progBvod: [twin], search: [search] }, "$14,754.10"),
  ]

  const collapses: Array<{ canonicalId: string; droppedIds: string[] }> = []
  const merged = appendAutoLineItemTemplateIntoWorking(working, template, FMT, {
    onCanonicalDedupe: (batch) => {
      for (const c of batch) collapses.push(c)
    },
  })
  const prog = (merged[0]?.lineItems?.progBvod as BillingLineItem[] | undefined) ?? []
  assert.equal(prog.length, 1, `expected canonical collapse, got ${prog.map((p) => p.id)}`)
  assert.ok(collapses.length > 0, "loud guard must report collapses")
  assert.equal(collapses[0]!.canonicalId, "supabase001PB1")
})

test("MB-30 DIAG: template already carries prepaid+auto for same line → merge appends (duplicating call)", () => {
  // Reproduces the live $40k shape when the auto template is not "auto-only" but
  // attach(working∪generated) left both rows under progBvod before merge.
  // Distinct canons (PB1 vs new-0) — loud canonical dedupe does NOT collapse these;
  // ticket stays open until upstream / template builder is fixed.
  const prepaid = line(
    "billing-progBvod::supabase001PB1",
    { [AUG]: 20000, [SEP]: 0 },
    { billingMode: "manual", header1: "YouTube", header2: "BVOD" }
  )
  const autoTwin = line(
    "billing-progBvod::new-0",
    { [AUG]: 10163.93, [SEP]: 9836.07 },
    { header1: "YouTube", header2: "BVOD" }
  )
  const search = line(
    "billing-search::supabase001SE1",
    { [AUG]: 5081.97, [SEP]: 4918.03 },
    { header1: "", header2: "" }
  )

  const working: BillingMonth[] = [
    month(AUG, { progBvod: [prepaid] }, "$20,000.00"),
    month(SEP, { progBvod: [JSON.parse(JSON.stringify(prepaid))] }, "$0.00"),
  ]
  const template: BillingMonth[] = [
    month(AUG, { progBvod: [prepaid, autoTwin], search: [search] }, "$35,245.90"),
    month(SEP, { progBvod: [prepaid, autoTwin], search: [search] }, "$14,754.10"),
  ]

  const merged = appendAutoLineItemTemplateIntoWorking(working, template, FMT)
  const prog = (merged[0]?.lineItems?.progBvod as BillingLineItem[] | undefined) ?? []
  const total = mediaSum(merged)

  // OPEN defect (distinct canons) — loud canonical dedupe does not collapse these.
  // When the real fix lands, flip expected length to 1 and mediaTotal to ~30k.
  assert.equal(
    prog.length,
    2,
    `OPEN MB-30 new-0 ghost: expected progBvod×2 until upstream fix; mediaTotal=${total}; ids=${prog.map((p) => p.id).join(",")}`
  )
})

test("MB-30 DIAG: empty progBvod lineItems but prepaid under wrong key → AUTO seeded alongside", () => {
  const prepaid = line(
    "billing-progBvod::supabase001PB1",
    { [AUG]: 20000, [SEP]: 0 },
    { billingMode: "manual", header1: "YouTube", header2: "BVOD" }
  )
  const autoProg = line("billing-progBvod::supabase001PB1", {
    [AUG]: 10163.93,
    [SEP]: 9836.07,
  })
  const search = line(
    "billing-search::supabase001SE1",
    { [AUG]: 5081.97, [SEP]: 4918.03 },
    { header1: "Google", header2: "Brand" }
  )

  // Mis-keyed bucket (legacy label) still holds the override row.
  const working: BillingMonth[] = [
    month(AUG, { bvod: [prepaid] } as BillingMonth["lineItems"], "$20,000.00"),
    month(SEP, { bvod: [JSON.parse(JSON.stringify(prepaid))] } as BillingMonth["lineItems"], "$0.00"),
  ]
  // Fix mediaCosts.progBvod residual that mirrors the live Aug header.
  for (const m of working) {
    ;(m.mediaCosts as Record<string, string>).progBvod = m.monthYear === AUG ? "$20,000.00" : "$0.00"
    m.mediaTotal = m.monthYear === AUG ? "$20,000.00" : "$0.00"
  }

  const template: BillingMonth[] = [
    month(AUG, { progBvod: [autoProg], search: [search] }, "$15,245.90"),
    month(SEP, { progBvod: [autoProg], search: [search] }, "$14,754.10"),
  ]

  const merged = appendAutoLineItemTemplateIntoWorking(working, template, FMT)
  const allLines: BillingLineItem[] = []
  for (const items of Object.values(merged[0]?.lineItems ?? {})) {
    if (Array.isArray(items)) allLines.push(...items)
  }
  const total = mediaSum(merged)
  assert.ok(
    Math.abs(total - 30000) < 0.02,
    `wrong-key residual doubled media (total=${total}); lines=${allLines.map((l) => l.id).join(",")}`
  )
})

test("MB-30 invariant: apply override → add channel → remove channel → add channel — no duplicate ids", () => {
  const prepaid = line(
    "billing-progBvod::supabase001PB1",
    { [AUG]: 20000, [SEP]: 0 },
    { billingMode: "manual", header1: "YouTube", header2: "BVOD" }
  )
  let working: BillingMonth[] = [
    month(AUG, { progBvod: [prepaid] }, "$20,000.00"),
    month(SEP, { progBvod: [JSON.parse(JSON.stringify(prepaid))] }, "$0.00"),
  ]

  const autoProg = line("billing-progBvod::supabase001PB1", {
    [AUG]: 10163.93,
    [SEP]: 9836.07,
  })
  const search = line(
    "billing-search::supabase001SE1",
    { [AUG]: 5081.97, [SEP]: 4918.03 },
    { header1: "Google", header2: "Brand" }
  )

  const withSearch: BillingMonth[] = [
    month(AUG, { progBvod: [autoProg], search: [search] }, "$15,245.90"),
    month(SEP, { progBvod: [autoProg], search: [search] }, "$14,754.10"),
  ]
  const progOnly: BillingMonth[] = [
    month(AUG, { progBvod: [autoProg] }, "$10,163.93"),
    month(SEP, { progBvod: [autoProg] }, "$9,836.07"),
  ]

  working = appendAutoLineItemTemplateIntoWorking(working, withSearch, FMT)
  working = appendAutoLineItemTemplateIntoWorking(working, progOnly, FMT)
  working = appendAutoLineItemTemplateIntoWorking(working, withSearch, FMT)

  const prog = (working[0]?.lineItems?.progBvod as BillingLineItem[] | undefined) ?? []
  const counts = countCanonicalIds(prog)
  assert.equal(counts.get("supabase001PB1"), 1)
  assert.equal(prog.length, 1)
  assert.ok(Math.abs(mediaSum(working) - 30000) < 0.02)
})
