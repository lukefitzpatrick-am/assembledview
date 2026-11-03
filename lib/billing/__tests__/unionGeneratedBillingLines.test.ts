/**
 * MB-30 (B20): edit's union paths (`attachLineItemsToMonths`,
 * `handleManualBillingOpen`) match generated rows to existing ones by
 * canonical id, then old-id alias, and skip placeholders, like the merge.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { BillingLineItem } from "@/lib/billing/types"
import { unionGeneratedBillingLines } from "@/lib/billing/unionGeneratedBillingLines"

const MAY = "May 2026"
const line = (id: string, amount: number, extra?: Partial<BillingLineItem>): BillingLineItem => ({
  id,
  header1: "Pub",
  header2: "Site",
  monthlyAmounts: { [MAY]: amount },
  totalAmount: amount,
  ...extra,
})

test("empty or missing bucket takes the generated list as is", () => {
  const generated = [line("billing-ooh::malay003OH1", 1), line("billing-ooh::new-1", 2)]
  for (const existing of [undefined, null, []]) {
    const r = unionGeneratedBillingLines(existing, generated, { mediaKey: "ooh", mbaNumber: "malay003" })
    assert.equal(r.list, generated)
    assert.equal(r.changed, true)
    assert.deepEqual(r.placeholderSkips, [])
  }
})

test("canonical match only: unchanged, same array (as before)", () => {
  const existing = [line("malay003OH1", 5)]
  const r = unionGeneratedBillingLines(existing, [line("billing-ooh::malay003OH1", 9)], {
    mediaKey: "ooh",
    mbaNumber: "malay003",
  })
  assert.equal(r.list, existing)
  assert.equal(r.changed, false)
})

test("old ids adopt the generated ids and keep their amounts; the input is not mutated", () => {
  const existing = [line("malay003ML1", 5000, { billingMode: "manual" }), line("malay003ML2", 3000)]
  const generated = [line("billing-ooh::malay003OH2", 3), line("billing-ooh::malay003OH1", 4)]
  const r = unionGeneratedBillingLines(existing, generated, { mediaKey: "ooh", mbaNumber: "malay003" })
  assert.deepEqual(
    r.list.map((x) => [x.id, x.monthlyAmounts[MAY], x.billingMode]),
    [
      ["billing-ooh::malay003OH1", 5000, "manual"],
      ["billing-ooh::malay003OH2", 3000, undefined],
    ],
  )
  assert.deepEqual(r.aliasAdoptions, [
    { fromId: "malay003ML2", toId: "billing-ooh::malay003OH2" },
    { fromId: "malay003ML1", toId: "billing-ooh::malay003OH1" },
  ])
  assert.equal(existing[0]!.id, "malay003ML1")
})

test("without an MBA number it behaves as before (old rows plus generated rows)", () => {
  const existing = [line("malay003ML1", 5000)]
  const r = unionGeneratedBillingLines(existing, [line("billing-ooh::malay003OH1", 4)], { mediaKey: "ooh" })
  assert.deepEqual(r.list.map((x) => x.id), ["malay003ML1", "billing-ooh::malay003OH1"])
})

test("a real new line is added after the existing rows; placeholders are skipped and reported", () => {
  const existing = [line("malay003ML1", 5000)]
  const r = unionGeneratedBillingLines(
    existing,
    [line("billing-ooh::malay003OH1", 4), line("billing-ooh::malay003OH3", 30), line("billing-ooh::new-2", 7)],
    { mediaKey: "ooh", mbaNumber: "malay003" },
  )
  assert.deepEqual(r.list.map((x) => x.id), ["billing-ooh::malay003OH1", "billing-ooh::malay003OH3"])
  assert.deepEqual(r.placeholderSkips, [{ id: "billing-ooh::new-2" }])
})

test("a row a generated id already matches is not alias-claimed (saved doubled rows stay)", () => {
  const existing = [line("hema001ML4", 3), line("hema001DD4", 3)]
  const r = unionGeneratedBillingLines(existing, [line("billing-digiDisplay::hema001DD4", 3)], {
    mediaKey: "digiDisplay",
    mbaNumber: "hema001",
  })
  assert.equal(r.list, existing)
  assert.equal(r.aliasAdoptions.length, 0)
})

test("blank generated ids are ignored, as before", () => {
  const existing = [line("malay003OH1", 1)]
  const r = unionGeneratedBillingLines(existing, [line("", 9)], { mediaKey: "ooh", mbaNumber: "malay003" })
  assert.equal(r.list, existing)
})

test("one to one: an existing row a generated id matches is never renamed by another generated row's alias", () => {
  const existing = [line("malay003OH1", 5, { billingMode: "manual" })]
  const r = unionGeneratedBillingLines(
    existing,
    [line("billing-ooh::malay003ML1", 5), line("billing-ooh::malay003OH1", 5)],
    { mediaKey: "ooh", mbaNumber: "malay003" },
  )
  assert.equal(r.aliasAdoptions.length, 0)
  assert.equal(r.list[0]!.id, "malay003OH1")
})
