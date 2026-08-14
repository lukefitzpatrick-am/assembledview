import assert from "node:assert/strict"
import { test } from "node:test"

import {
  addSydneyDays,
  myWeekDueRange,
  parseQuickAdd,
  sydneyCivilParts,
} from "../quickAddParse.js"

const team = [
  { email: "luke@assembledmedia.com.au", name: "Luke Fitzpatrick" },
  { email: "sam@assembledmedia.com.au", name: "Sam Chen" },
]

const clients = [
  { id: 10, label: "Woolworths", slug: "woolworths" },
  { id: 11, label: "Acme Bank", slug: "acme-bank" },
]

/** Fixed instant: Wednesday 6 Aug 2025 04:00 UTC = Wednesday in Sydney (AEST). */
const WED = new Date("2025-08-06T04:00:00.000Z")

test("sydneyCivilParts is Wednesday 2025-08-06 for WED fixture", () => {
  const p = sydneyCivilParts(WED)
  assert.equal(p.ymd, "2025-08-06")
  assert.equal(p.weekday, 3)
})

test("parseQuickAdd strips matched @ # ! and due, leaves title", () => {
  const r = parseQuickAdd({
    text: "Chase report @luke #woolworths !high due friday",
    team,
    clients,
    now: WED,
  })
  assert.equal(r.title, "Chase report")
  assert.equal(r.assigneeEmail, "luke@assembledmedia.com.au")
  assert.equal(r.assigneeFromToken, true)
  assert.equal(r.clientId, 10)
  assert.equal(r.priority, "high")
  assert.equal(r.dueDate, "2025-08-08") // Friday
  assert.ok(r.chips.every((c) => c.kind === "warning" || c.ok))
})

test("unmatched @token stays in title — never silently dropped", () => {
  const r = parseQuickAdd({
    text: "Ping @nobody about billing",
    team,
    clients,
    defaultAssigneeEmail: "luke@assembledmedia.com.au",
    defaultAssigneeName: "Luke Fitzpatrick",
    fallbackClientId: 10,
    fallbackClientLabel: "Woolworths",
    now: WED,
  })
  assert.match(r.title, /@nobody/)
  assert.equal(r.assigneeFromToken, false)
  assert.equal(r.assigneeEmail, "luke@assembledmedia.com.au")
  assert.ok(r.chips.some((c) => !c.ok && /@nobody/.test(c.label)))
})

test("unmatched #client stays in title", () => {
  const r = parseQuickAdd({
    text: "Thing #unknowncorp",
    team,
    clients,
    defaultAssigneeEmail: "luke@assembledmedia.com.au",
    now: WED,
  })
  assert.match(r.title, /#unknowncorp/)
  assert.equal(r.clientId, null)
  assert.ok(r.chips.some((c) => !c.ok && /Client required/.test(c.label)))
})

test("!medium stays in title; !high is consumed", () => {
  const r = parseQuickAdd({
    text: "Work !medium !high",
    team,
    clients,
    fallbackClientId: 10,
    fallbackClientLabel: "Woolworths",
    now: WED,
  })
  assert.equal(r.priority, "high")
  assert.match(r.title, /!medium/)
})

test("due tomorrow uses Sydney civil day", () => {
  const r = parseQuickAdd({
    text: "Ship due tomorrow",
    team,
    clients,
    fallbackClientId: 10,
    fallbackClientLabel: "Woolworths",
    now: WED,
  })
  assert.equal(r.dueDate, "2025-08-07")
  assert.equal(r.title, "Ship")
})

test("due 15 Aug rolls forward from Sydney year", () => {
  const r = parseQuickAdd({
    text: "Invoice due 15 Aug",
    team,
    clients,
    fallbackClientId: 10,
    fallbackClientLabel: "Woolworths",
    now: WED,
  })
  assert.equal(r.dueDate, "2025-08-15")
})

test("fallback client from filter when no #token", () => {
  const r = parseQuickAdd({
    text: "Quick note",
    team,
    clients,
    fallbackClientId: 11,
    fallbackClientLabel: "Acme Bank",
    defaultAssigneeEmail: "sam@assembledmedia.com.au",
    now: WED,
  })
  assert.equal(r.clientId, 11)
  assert.ok(r.chips.some((c) => c.kind === "client" && /filter/.test(c.label)))
})

test("myWeekDueRange is today..+7 Sydney", () => {
  const range = myWeekDueRange(WED)
  assert.equal(range.dueAfter, "2025-08-06")
  assert.equal(range.dueBefore, addSydneyDays("2025-08-06", 7))
})

test("@name fuzzy unique match", () => {
  const r = parseQuickAdd({
    text: "Ask @sam",
    team,
    clients,
    fallbackClientId: 10,
    fallbackClientLabel: "Woolworths",
    now: WED,
  })
  assert.equal(r.assigneeEmail, "sam@assembledmedia.com.au")
  assert.equal(r.title, "Ask")
})

test("~2h / ~45m tokens become estimatedMinutes and leave the title", () => {
  const hours = parseQuickAdd({
    text: "Write report ~2h #woolworths",
    team,
    clients,
    now: WED,
  })
  assert.equal(hours.estimatedMinutes, 120)
  assert.equal(hours.title, "Write report")
  assert.ok(hours.chips.some((c) => c.kind === "estimate" && c.ok))

  const mins = parseQuickAdd({
    text: "Quick ping ~45m #woolworths",
    team,
    clients,
    now: WED,
  })
  assert.equal(mins.estimatedMinutes, 45)
  assert.equal(mins.title, "Quick ping")
})

test("unmatched ~token stays in the title", () => {
  const r = parseQuickAdd({
    text: "Chase ~foo #woolworths",
    team,
    clients,
    now: WED,
  })
  assert.match(r.title, /~foo/)
  assert.equal(r.estimatedMinutes, null)
  assert.ok(r.chips.some((c) => !c.ok && /~foo/.test(c.label)))
})
