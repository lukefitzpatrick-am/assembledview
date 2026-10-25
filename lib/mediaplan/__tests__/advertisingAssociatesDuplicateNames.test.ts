import assert from "node:assert/strict"
import test, { afterEach, beforeEach, mock } from "node:test"

import type { LineItem } from "@/lib/generateMediaPlan"
import {
  lineItemBillsViaAdvertisingAssociates,
  publisherResolver,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
import {
  buildPublisherByNameMap,
  resetPublisherNameConflictWarningsForTests,
} from "@/lib/publisher/publisherUniqueness"
import type { Publisher } from "@/lib/types/publisher"

function pub(id: number, publisher_name: string, publisherid: string, billingagency: string): Publisher {
  return { id, publisher_name, publisherid, billingagency } as unknown as Publisher
}

function line(network: string): LineItem {
  return {
    market: "",
    network,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    deliverables: 1,
    deliverablesAmount: "1000",
    grossMedia: "1000",
    buyType: "cpm",
  }
}

let warn: ReturnType<typeof mock.method>

beforeEach(() => {
  resetPublisherNameConflictWarningsForTests()
  warn = mock.method(console, "warn", () => {})
})

afterEach(() => {
  warn.mock.restore()
})

test("duplicate names that agree on billing agency resolve to the lowest id, no warning", () => {
  const resolve = publisherResolver([
    pub(62, "Broadsheet", "Broadsheet", "advertising associates"),
    pub(33, "Broadsheet", "Broadsheet", "advertising associates"),
  ])
  assert.equal((resolve("Broadsheet") as unknown as { id: number }).id, 33)
  assert.equal(warn.mock.calls.length, 0)
})

test("duplicate names that disagree resolve to the lowest id and warn once naming both", () => {
  const publishers = [
    pub(62, "Broadsheet", "Broadsheet", "assembled media"),
    pub(33, "Broadsheet", "Broadsheet", "advertising associates"),
  ]
  const resolve = publisherResolver(publishers)
  assert.equal((resolve("Broadsheet") as unknown as { id: number }).id, 33)
  // Same answer whichever order the rows arrive in (never last-wins).
  const reversed = publisherResolver([...publishers].reverse())
  assert.equal((reversed("broadsheet ") as unknown as { id: number }).id, 33)
  assert.equal(lineItemBillsViaAdvertisingAssociates(line("Broadsheet"), publishers), true)
  assert.equal(warn.mock.calls.length, 1)
  const message = String(warn.mock.calls[0].arguments[0])
  assert.match(message, /share the name "Broadsheet"/)
  assert.match(message, /#33 Broadsheet \(advertising associates\)/)
  assert.match(message, /#62 Broadsheet \(assembled media\)/)
  assert.match(message, /lowest id #33/)
})

test("case and trailing spaces group as one name (Nine vs 'Nine ')", () => {
  const resolve = publisherResolver([
    pub(61, "Nine ", "Nine", "assembled media"),
    pub(11, "Nine", "nine", "advertising associates"),
  ])
  assert.equal((resolve("NINE") as unknown as { id: number }).id, 11)
  assert.equal((resolve(" nine") as unknown as { id: number }).id, 11)
  assert.equal(warn.mock.calls.length, 1)
})

test("a publisherid shared by two publishers still never matches (Linkby / LinkedIn 'link')", () => {
  const resolve = publisherResolver([
    pub(22, "Linkby", "link", "assembled media"),
    pub(37, "LinkedIn", "link", "assembled media"),
  ])
  assert.equal(resolve("link"), undefined)
  assert.equal((resolve("LinkedIn") as unknown as { id: number }).id, 37)
})

test("buildPublisherByNameMap keeps the lowest id per key, not the last row", () => {
  const map = buildPublisherByNameMap([
    { id: 62, publisher_name: "Broadsheet", billingagency: "assembled media" },
    { id: 33, publisher_name: "Broadsheet", billingagency: "advertising associates" },
    { id: 5, publisher_name: "Seven", billingagency: "assembled media" },
  ])
  assert.equal(map.get("Broadsheet")?.id, 33)
  assert.equal(map.get("Seven")?.id, 5)
  assert.equal(warn.mock.calls.length, 1)
})

test("buildPublisherByNameMap with a normaliser groups trimmed and case variants", () => {
  const map = buildPublisherByNameMap(
    [
      { id: 61, publisher_name: "Nine ", billingagency: "advertising associates" },
      { id: 11, publisher_name: "Nine", billingagency: "advertising associates" },
    ],
    (n) => n.trim().toLowerCase(),
  )
  assert.equal(map.get("nine")?.id, 11)
  assert.equal(map.size, 1)
  assert.equal(warn.mock.calls.length, 0)
})
