import assert from "node:assert/strict"
import test from "node:test"

import { groupAndSubtotal } from "../groupAndSubtotal.js"
import type { ReportRow } from "../types.js"

function row(overrides: Partial<ReportRow>): ReportRow {
  return {
    mbaNumber: "MBA-1",
    billingMonth: "2026-05",
    client: "Client",
    mediaType: "Search",
    publisher: "Google",
    buyType: "CPC",
    format: "Unspecified",
    station: "Unspecified",
    rowKind: "media",
    totalBillable: 100,
    mediaSpend: 80,
    agencyFee: 20,
    clientPays: false,
    ...overrides,
  }
}

function sumTotal(rows: ReportRow[]): number {
  return rows.reduce((sum, candidate) => sum + candidate.totalBillable, 0)
}

test("groupAndSubtotal groups one dimension and orders Unspecified last", () => {
  const rows = [
    row({ mediaType: "Unspecified", totalBillable: 5, mediaSpend: 5, agencyFee: 0 }),
    row({ mediaType: "Radio", totalBillable: 20, mediaSpend: 18, agencyFee: 2 }),
    row({ mediaType: "Search", totalBillable: 30, mediaSpend: 25, agencyFee: 5 }),
    row({ mediaType: "Radio", totalBillable: 10, mediaSpend: 9, agencyFee: 1 }),
  ]

  const root = groupAndSubtotal(rows, ["mediaType"])

  assert.equal(root.dimension, null)
  assert.equal(root.key, "Grand Total")
  assert.equal(root.rowCount, 4)
  assert.deepEqual(
    root.children.map((child) => child.key),
    ["Radio", "Search", "Unspecified"]
  )
  assert.equal(root.children[0]!.measures.totalBillable, 30)
  assert.equal(root.children[0]!.measures.mediaSpend, 27)
  assert.equal(root.children[0]!.measures.agencyFee, 3)
})

test("groupAndSubtotal nests by ordered dimensions", () => {
  const rows = [
    row({ mediaType: "Search", publisher: "Google", buyType: "CPC", totalBillable: 100 }),
    row({ mediaType: "Search", publisher: "Google", buyType: "CPM", totalBillable: 50 }),
    row({ mediaType: "Search", publisher: "Bing", buyType: "CPC", totalBillable: 25 }),
    row({ mediaType: "Radio", publisher: "Nova", buyType: "Spots", totalBillable: 75 }),
  ]

  const root = groupAndSubtotal(rows, ["mediaType", "publisher", "buyType"])
  const search = root.children.find((child) => child.key === "Search")
  assert.ok(search)

  assert.equal(search.dimension, "mediaType")
  assert.equal(search.measures.totalBillable, 175)
  assert.deepEqual(
    search.children.map((child) => child.key),
    ["Bing", "Google"]
  )

  const google = search.children.find((child) => child.key === "Google")
  assert.ok(google)
  assert.equal(google.dimension, "publisher")
  assert.deepEqual(
    google.children.map((child) => `${child.dimension}:${child.key}:${child.measures.totalBillable}`),
    ["buyType:CPC:100", "buyType:CPM:50"]
  )
})

test("groupAndSubtotal reorder changes nesting without changing totals", () => {
  const rows = [
    row({ mediaType: "Search", publisher: "Google", totalBillable: 100 }),
    row({ mediaType: "Radio", publisher: "Google", totalBillable: 75 }),
    row({ mediaType: "Search", publisher: "Bing", totalBillable: 25 }),
  ]

  const mediaFirst = groupAndSubtotal(rows, ["mediaType", "publisher"])
  const publisherFirst = groupAndSubtotal(rows, ["publisher", "mediaType"])

  assert.deepEqual(
    mediaFirst.children.map((child) => child.dimension),
    ["mediaType", "mediaType"]
  )
  assert.deepEqual(
    publisherFirst.children.map((child) => child.dimension),
    ["publisher", "publisher"]
  )
  assert.equal(mediaFirst.measures.totalBillable, publisherFirst.measures.totalBillable)
  assert.equal(mediaFirst.rowCount, publisherFirst.rowCount)
})

test("groupAndSubtotal groups by client and keeps the grand total invariant", () => {
  const rows = [
    row({ client: "Acme", totalBillable: 100, mediaSpend: 80, agencyFee: 20 }),
    row({ client: "Beta", totalBillable: 75, mediaSpend: 60, agencyFee: 15 }),
    row({ client: "Acme", totalBillable: 25, mediaSpend: 20, agencyFee: 5 }),
  ]

  const clientRoot = groupAndSubtotal(rows, ["client"])
  const mediaRoot = groupAndSubtotal(rows, ["mediaType"])

  assert.deepEqual(
    clientRoot.children.map((child) => `${child.dimension}:${child.key}:${child.measures.totalBillable}`),
    ["client:Acme:125", "client:Beta:75"]
  )
  assert.equal(clientRoot.measures.totalBillable, mediaRoot.measures.totalBillable)
  assert.equal(clientRoot.measures.totalBillable, sumTotal(rows))
})

test("groupAndSubtotal groups by billing month then media type without changing the grand total", () => {
  const rows = [
    row({ billingMonth: "2026-05", mediaType: "Search", totalBillable: 100 }),
    row({ billingMonth: "2026-05", mediaType: "Radio", totalBillable: 75 }),
    row({ billingMonth: "2026-06", mediaType: "Search", totalBillable: 25 }),
  ]

  const root = groupAndSubtotal(rows, ["billingMonth", "mediaType"])
  const mediaRoot = groupAndSubtotal(rows, ["mediaType"])
  const may = root.children.find((child) => child.key === "2026-05")
  assert.ok(may)

  assert.equal(may.dimension, "billingMonth")
  assert.equal(may.measures.totalBillable, 175)
  assert.deepEqual(
    may.children.map((child) => `${child.dimension}:${child.key}:${child.measures.totalBillable}`),
    ["mediaType:Radio:75", "mediaType:Search:100"]
  )
  assert.equal(root.measures.totalBillable, mediaRoot.measures.totalBillable)
  assert.equal(root.measures.totalBillable, sumTotal(rows))
})

test("groupAndSubtotal supports empty input", () => {
  const root = groupAndSubtotal([], ["mediaType", "publisher"])

  assert.equal(root.dimension, null)
  assert.equal(root.key, "Grand Total")
  assert.equal(root.rowCount, 0)
  assert.deepEqual(root.measures, { totalBillable: 0, mediaSpend: 0, agencyFee: 0 })
  assert.deepEqual(root.children, [])
})

test("groupAndSubtotal grand total is invariant across grouping order", () => {
  const rows = [
    row({ mediaType: "Search", publisher: "Google", buyType: "CPC", totalBillable: 100 }),
    row({ mediaType: "Radio", publisher: "Nova", buyType: "Spots", totalBillable: 75 }),
    row({ mediaType: "Production", publisher: "Unspecified", buyType: "Unspecified", totalBillable: 25 }),
  ]

  for (const order of [
    [] as const,
    ["mediaType"] as const,
    ["publisher", "mediaType"] as const,
    ["buyType", "publisher", "mediaType"] as const,
  ]) {
    const root = groupAndSubtotal(rows, [...order])
    assert.equal(root.measures.totalBillable, sumTotal(rows))
  }
})
