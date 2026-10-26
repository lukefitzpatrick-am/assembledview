import assert from "node:assert/strict"
import test from "node:test"

import {
  PUBLISHER_NAME_ALIASES,
  buildPublisherNameIndex,
  createBillsViaAdvertisingAssociates,
  resolvePublisherNameMatch,
} from "@/lib/publisher/resolvePublisherName"
import { resetPublisherNameConflictWarningsForTests } from "@/lib/publisher/publisherUniqueness"

const publishers = [
  { id: 12, publisher_name: "Southern Cross Austereo", publisherid: "sca", billingagency: "advertising associates" },
  { id: 20, publisher_name: "Nova", publisherid: "Nova", billingagency: "advertising associates" },
  { id: 65, publisher_name: "Vicinity", publisherid: "Vicinity", billingagency: "assembled media" },
  { id: 77, publisher_name: "GoTranist", publisherid: "GoTransit", billingagency: "advertising associates" },
  { id: 3, publisher_name: "Dup", publisherid: "dup-a", billingagency: "assembled media" },
  { id: 2, publisher_name: " dup ", publisherid: "dup-b", billingagency: "assembled media" },
  { id: 40, publisher_name: "Shared Id One", publisherid: "same", billingagency: "advertising associates" },
  { id: 41, publisher_name: "Shared Id Two", publisherid: "SAME", billingagency: "advertising associates" },
]

test("aliases are the four Luke approved", () => {
  assert.deepEqual(
    { ...PUBLISHER_NAME_ALIASES },
    {
      sca: "Southern Cross Austereo",
      nova: "Nova",
      "go transit": "GoTranist",
      "vicinity group": "Vicinity",
    },
  )
})

test("alias keys are lower-case trimmed", () => {
  for (const key of Object.keys(PUBLISHER_NAME_ALIASES)) {
    assert.equal(key, key.trim().toLowerCase())
  }
})

test("Go Transit reads as GoTranist (#77) through the alias", () => {
  const index = buildPublisherNameIndex(publishers)
  for (const typed of ["Go Transit", " go transit ", "GO TRANSIT"]) {
    const m = resolvePublisherNameMatch(typed, index)
    assert.equal(m?.publisher.id, 77)
    assert.equal(m?.matchedBy, "alias")
  }
  // The stored misspelt name and its publisherid still resolve.
  assert.equal(resolvePublisherNameMatch("GoTranist", index)?.matchedBy, "name")
  assert.equal(resolvePublisherNameMatch("gotransit", index)?.publisher.id, 77)
})

test("Vicinity Group reads as Vicinity (#65) through the alias", () => {
  const index = buildPublisherNameIndex(publishers)
  const m = resolvePublisherNameMatch(" Vicinity Group", index)
  assert.equal(m?.publisher.id, 65)
  assert.equal(m?.matchedBy, "alias")
})

test("name first, case-insensitive and trimmed", () => {
  const index = buildPublisherNameIndex(publishers)
  assert.equal(resolvePublisherNameMatch("  nova ", index)?.publisher.id, 20)
  assert.equal(resolvePublisherNameMatch("NOVA", index)?.matchedBy, "name")
})

test("shared name takes the lowest id, never last-wins", () => {
  resetPublisherNameConflictWarningsForTests()
  const index = buildPublisherNameIndex(publishers)
  assert.equal(resolvePublisherNameMatch("DUP", index)?.publisher.id, 2)
})

test("alias before publisher id", () => {
  const index = buildPublisherNameIndex(publishers)
  const m = resolvePublisherNameMatch("SCA", index)
  assert.equal(m?.publisher.id, 12)
  assert.equal(m?.matchedBy, "alias")
})

test("publisher id when no name or alias; a shared id never matches", () => {
  const index = buildPublisherNameIndex(publishers)
  assert.equal(resolvePublisherNameMatch("vicinity", index)?.matchedBy, "name")
  assert.equal(resolvePublisherNameMatch("dup-a", index)?.publisher.id, 3)
  assert.equal(resolvePublisherNameMatch("dup-a", index)?.matchedBy, "publisherid")
  assert.equal(resolvePublisherNameMatch("same", index), undefined)
})

test("a real publisher named like an alias wins over the alias", () => {
  const index = buildPublisherNameIndex([
    ...publishers,
    { id: 99, publisher_name: "SCA", publisherid: "sca-real", billingagency: "assembled media" },
  ])
  assert.equal(resolvePublisherNameMatch("sca", index)?.publisher.id, 99)
})

test("Vicinity Group follows #65 when #65 bills via AA", () => {
  const billsViaAA = createBillsViaAdvertisingAssociates(
    publishers.map((p) => (p.id === 65 ? { ...p, billingagency: "advertising associates" } : p)),
  )
  assert.equal(billsViaAA("Vicinity Group"), true)
  assert.equal(billsViaAA("Vicinity"), true)
})

test("bills via AA for the finance production split", () => {
  const billsViaAA = createBillsViaAdvertisingAssociates(publishers)
  assert.equal(billsViaAA("SCA"), true)
  assert.equal(billsViaAA("NOVA"), true)
  assert.equal(billsViaAA("Vicinity"), false)
  // Alias to #65, which follows #65's billing agency (assembled media here).
  assert.equal(billsViaAA("Vicinity Group"), false)
  assert.equal(billsViaAA("Go Transit"), true)
  assert.equal(billsViaAA("Vogue"), false)
  assert.equal(billsViaAA(""), false)
})
