import assert from "node:assert/strict"
import test from "node:test"

import {
  findPublisherIdentityConflicts,
  listPublisherDuplicates,
  pickPublisherFromDuplicates,
  publisherIdentityConflictMessages,
  publisherIdentityKey,
  sortPublishersByRowId,
} from "@/lib/publisher/publisherUniqueness"

const rows = [
  { id: 62, publisher_name: "Broadsheet", publisherid: "Broadsheet", billingagency: "advertising associates" },
  { id: 11, publisher_name: "Nine", publisherid: "nine", billingagency: "advertising associates" },
  { id: 33, publisher_name: "Broadsheet", publisherid: "Broadsheet", billingagency: "advertising associates" },
  { id: 61, publisher_name: "Nine ", publisherid: "Nine", billingagency: "advertising associates" },
  { id: 22, publisher_name: "Linkby", publisherid: "link", billingagency: "assembled media" },
  { id: 37, publisher_name: "LinkedIn", publisherid: "link", billingagency: "assembled media" },
  { id: 5, publisher_name: "Seven", publisherid: "seven", billingagency: "assembled media" },
]

test("publisherIdentityKey trims and lower-cases", () => {
  assert.equal(publisherIdentityKey("  Nine  "), "nine")
  assert.equal(publisherIdentityKey(null), "")
  assert.equal(publisherIdentityKey(undefined), "")
})

test("sortPublishersByRowId puts the lowest id first and rows without an id last", () => {
  const sorted = sortPublishersByRowId([{ id: 9 }, { id: null }, { id: 2 }, { id: "4" }])
  assert.deepEqual(sorted.map((r) => r.id), [2, "4", 9, null])
})

test("create: a name that differs only by case and spaces is a conflict", () => {
  const conflicts = findPublisherIdentityConflicts(
    { publisher_name: "  seven ", publisherid: "seven-new" },
    rows,
    null,
  )
  assert.deepEqual(conflicts.publisher_name.map((r) => r.id), [5])
  assert.deepEqual(conflicts.publisherid, [])
  const msgs = publisherIdentityConflictMessages({ publisher_name: "  seven ", publisherid: "seven-new" }, conflicts)
  assert.match(msgs.publisher_name ?? "", /Publisher name "seven" is already used by Seven \(publisher ID "seven", record #5\)/)
  assert.equal(msgs.publisherid, undefined)
})

test("create: a publisherid that differs only by case is a conflict", () => {
  const conflicts = findPublisherIdentityConflicts({ publisher_name: "Brand New", publisherid: "SEVEN" }, rows, null)
  assert.deepEqual(conflicts.publisherid.map((r) => r.id), [5])
  const msgs = publisherIdentityConflictMessages({ publisher_name: "Brand New", publisherid: "SEVEN" }, conflicts)
  assert.match(msgs.publisherid ?? "", /Publisher ID "SEVEN" is already used by Seven/)
})

test("edit: a publisher never conflicts with itself", () => {
  const conflicts = findPublisherIdentityConflicts({ publisher_name: "Seven", publisherid: "seven" }, rows, 5)
  assert.deepEqual(conflicts, { publisher_name: [], publisherid: [] })
  assert.deepEqual(publisherIdentityConflictMessages({ publisher_name: "Seven", publisherid: "seven" }, conflicts), {})
})

test("edit: saving #62 still reports the other Broadsheet (#33), lowest id first", () => {
  const conflicts = findPublisherIdentityConflicts({ publisher_name: "Broadsheet", publisherid: "Broadsheet" }, rows, 62)
  assert.deepEqual(conflicts.publisher_name.map((r) => r.id), [33])
  assert.deepEqual(conflicts.publisherid.map((r) => r.id), [33])
})

test("blank name or id never conflicts", () => {
  const conflicts = findPublisherIdentityConflicts({ publisher_name: "  ", publisherid: "" }, [
    { id: 1, publisher_name: "", publisherid: " " },
  ], null)
  assert.deepEqual(conflicts, { publisher_name: [], publisherid: [] })
})

test("listPublisherDuplicates finds name and id duplicates, trimmed and case-insensitive", () => {
  const groups = listPublisherDuplicates(rows)
  assert.deepEqual(
    groups.map((g) => [g.field, g.key, g.publishers.map((p) => p.id)]),
    [
      ["publisher_name", "broadsheet", [33, 62]],
      ["publisher_name", "nine", [11, 61]],
      ["publisherid", "broadsheet", [33, 62]],
      ["publisherid", "link", [22, 37]],
      ["publisherid", "nine", [11, 61]],
    ],
  )
})

test("listPublisherDuplicates is empty for a clean list", () => {
  assert.deepEqual(listPublisherDuplicates([rows[1], rows[4], rows[6]]), [])
})

test("pickPublisherFromDuplicates: agreeing rows pick the lowest id with no conflict", () => {
  const pick = pickPublisherFromDuplicates([rows[0], rows[2]])
  assert.equal(pick?.publisher.id, 33)
  assert.equal(pick?.billingAgencyConflict, false)
})

test("pickPublisherFromDuplicates: billing agency compared trimmed and case-insensitive", () => {
  const pick = pickPublisherFromDuplicates([
    { id: 8, billingagency: "Advertising Associates " },
    { id: 3, billingagency: "advertising associates" },
  ])
  assert.equal(pick?.publisher.id, 3)
  assert.equal(pick?.billingAgencyConflict, false)
})

test("pickPublisherFromDuplicates: conflicting rows still pick the lowest id and flag it", () => {
  const pick = pickPublisherFromDuplicates([
    { id: 62, billingagency: "assembled media" },
    { id: 33, billingagency: "advertising associates" },
  ])
  assert.equal(pick?.publisher.id, 33)
  assert.equal(pick?.billingAgencyConflict, true)
})

test("pickPublisherFromDuplicates: empty list gives null", () => {
  assert.equal(pickPublisherFromDuplicates([]), null)
})
