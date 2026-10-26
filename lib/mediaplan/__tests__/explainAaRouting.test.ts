import assert from "node:assert/strict"
import test from "node:test"

import { explainAaRouting } from "@/lib/mediaplan/explainAaRouting"
import { buildPublisherNameIndex } from "@/lib/publisher/resolvePublisherName"

// Live shapes (publishers table, 26 Oct 2026).
const publishers = [
  { id: 12, publisher_name: "Southern Cross Austereo", publisherid: "sca", billingagency: "advertising associates" },
  { id: 20, publisher_name: "Nova", publisherid: "Nova", billingagency: "advertising associates" },
  { id: 65, publisher_name: "Vicinity", publisherid: "Vicinity", billingagency: "assembled media" },
  { id: 77, publisher_name: "GoTranist", publisherid: "GoTransit", billingagency: "advertising associates" },
  { id: 90, publisher_name: "Odd Agency", publisherid: "odd", billingagency: "" },
]
const index = buildPublisherNameIndex(publishers)

test("canonical AA publisher is on the AA plan", () => {
  const r = explainAaRouting({ names: ["Southern Cross Austereo"] }, index)
  assert.equal(r.onAaPlan, true)
  assert.equal(r.reason, null)
  assert.equal(r.billingAgency, "Advertising Associates")
  assert.equal(r.publisher?.id, 12)
  assert.equal(r.matchedBy, "name")
  assert.deepEqual(r.notes, [])
})

test("NOVA matches Nova by name, case ignored, with a note", () => {
  const r = explainAaRouting({ names: ["NOVA"] }, index)
  assert.equal(r.onAaPlan, true)
  assert.equal(r.publisher?.name, "Nova")
  assert.equal(r.matchedBy, "name")
  assert.equal(r.notes.length, 1)
})

test("SCA is read through the alias to Southern Cross Austereo", () => {
  const r = explainAaRouting({ names: [" SCA "] }, index)
  assert.equal(r.onAaPlan, true)
  assert.equal(r.publisher?.id, 12)
  assert.equal(r.matchedBy, "alias")
  assert.match(r.notes[0]!, /Pick Southern Cross Austereo/)
})

test("publisher not found misses AA", () => {
  const r = explainAaRouting({ names: ["Go Transit"] }, index)
  assert.equal(r.onAaPlan, false)
  assert.equal(r.reason, "publisher_not_found")
  assert.equal(r.publisher, null)
  assert.match(r.message, /"Go Transit" is not in Publishers/)
})

test("blank publisher misses AA", () => {
  for (const names of [[], [""], ["  ", null, undefined]]) {
    const r = explainAaRouting({ names }, index)
    assert.equal(r.onAaPlan, false)
    assert.equal(r.reason, "publisher_blank")
  }
})

test("Assembled Media billing agency misses AA", () => {
  const r = explainAaRouting({ names: ["Vicinity"] }, index)
  assert.equal(r.onAaPlan, false)
  assert.equal(r.reason, "billing_agency_assembled_media")
  assert.equal(r.billingAgency, "Assembled Media")
})

test("blank billing agency counts as Assembled Media", () => {
  const r = explainAaRouting({ names: ["Odd Agency"] }, index)
  assert.equal(r.onAaPlan, false)
  assert.equal(r.reason, "billing_agency_other")
  assert.match(r.message, /no billing agency set/)
})

test("any AA field wins, like the AA filter (site AA, platform AM)", () => {
  const r = explainAaRouting({ names: ["Vicinity", "Nova"] }, index)
  assert.equal(r.onAaPlan, true)
  assert.equal(r.publisher?.name, "Nova")
})

test("publisher id match is explained", () => {
  const r = explainAaRouting({ names: ["gotransit"] }, index)
  assert.equal(r.onAaPlan, true)
  assert.equal(r.matchedBy, "publisherid")
  assert.equal(r.publisher?.name, "GoTranist")
})

test("no amount keeps an AA line off the plan", () => {
  const r = explainAaRouting({ names: ["Nova"], included: false }, index)
  assert.equal(r.onAaPlan, false)
  assert.equal(r.reason, "no_amount")
})

test("client pays for media is noted but does not change routing", () => {
  const r = explainAaRouting({ names: ["Southern Cross Austereo"], clientPaysForMedia: true }, index)
  assert.equal(r.onAaPlan, true)
  assert.ok(r.notes.some((n) => /Client pays for media/.test(n)))
})
